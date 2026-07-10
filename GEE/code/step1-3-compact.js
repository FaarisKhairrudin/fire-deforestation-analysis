// =====================================================================
// FIRE-DRONE: Analisis Spasio-Temporal GEE - Tahap 1-3 (BUG FIXED)
// Wilayah Studi: Provinsi Jambi, Indonesia (2020-2025)
// Sensor Optik: Landsat 8/9 OLI & Sentinel-2 MSI (Harmonized)
// Sensor Api: MOD14A1 (MODIS) & VNP14IMGTDL (VIIRS)
// =====================================================================

var CONFIG = {
    provinceName: 'Jambi',
    startYear: 2020,
    endYear: 2025,

    ndviThreshold: 0.2,
    dNBR_low: 0.1,
    dNBR_moderate: 0.27,
    dNBR_mod_high: 0.44, // Ditambahkan agar klasifikasi USGS akurat
    dNBR_high: 0.66,

    assetPath: 'users/faarisnew/fire-drone-2026/', // UBAH INI
    exportScale: 30,
    hotspotExportScale: 375,
    exportCRS: 'EPSG:32648',
    MAX_PIXELS: 1e13
};

// 1. REGION OF INTEREST & DATASETS
var gaul = ee.FeatureCollection('FAO/GAUL/2015/level1');
var jambiROI = gaul.filter(ee.Filter.eq('ADM1_NAME', CONFIG.provinceName));
Map.centerObject(jambiROI, 8);

var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(jambiROI);
var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(jambiROI);
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(jambiROI);

var hansenGFC = ee.Image('UMD/hansen/global_forest_change_2025_v1_13');
var modisFire = ee.ImageCollection('MODIS/061/MOD14A1').filterBounds(jambiROI);
var firms = ee.ImageCollection('FIRMS').filterBounds(jambiROI);
var mcd64Burn = ee.ImageCollection('MODIS/061/MCD64A1').filterBounds(jambiROI);

// 2. PREPROCESSING & SENSOR FUSION
function prepLandsat(img) {
    var qaMask = img.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
    var scaled = img.updateMask(qaMask)
        .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'])
        .multiply(0.0000275).add(-0.2).toFloat();
    var ndvi = scaled.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    var nbr = scaled.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');
    return scaled.addBands([ndvi, nbr]).copyProperties(img, ['system:time_start']);
}

function prepS2(img) {
    // [FIX] Membuang QA60 dan menggantinya dengan SCL
    // SCL sangat ampuh membuang bayangan awan dan noise El Nino
    var scl = img.select('SCL');
    var qaMask = scl.neq(3)       // 3: Cloud Shadows (Penyebab utama peta putih)
        .and(scl.neq(8)) // 8: Cloud Medium Probability
        .and(scl.neq(9)) // 9: Cloud High Probability
        .and(scl.neq(10)); // 10: Thin Cirrus

    var scaled = img.updateMask(qaMask)
        .select(['B2', 'B3', 'B4', 'B8', 'B12']).divide(10000).toFloat()
        .rename(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7']);

    var ndvi = scaled.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    var nbr = scaled.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');

    return scaled.addBands([ndvi, nbr]).copyProperties(img, ['system:time_start']);
}

var years = ee.List.sequence(CONFIG.startYear, CONFIG.endYear);

// TAHAP 1: KOMPOSIT TAHUNAN
var yearlyComposites = ee.ImageCollection(years.map(function (y) {
    y = ee.Number(y);
    var start = ee.Date.fromYMD(y, 1, 1);
    var end = ee.Date.fromYMD(y.add(1), 1, 1);
    var l8Col = l8.filterDate(start, end).map(prepLandsat);
    var l9Col = l9.filterDate(start, end).map(prepLandsat);
    var s2Col = s2.filterDate(start, end).map(prepS2);
    return l8Col.merge(l9Col).merge(s2Col).median().clip(jambiROI).set('year', y);
}));
var compositeList = yearlyComposites.sort('year').toList(CONFIG.endYear - CONFIG.startYear + 1);

// TAHAP 2: DEFORESTASI & VALIDASI GFW
var deforestationMaps = ee.ImageCollection(
    ee.List.sequence(CONFIG.startYear, CONFIG.endYear - 1).map(function (y) {
        y = ee.Number(y);
        var idx = y.subtract(CONFIG.startYear);
        var ndviT = ee.Image(compositeList.get(idx)).select('NDVI');
        var ndviT1 = ee.Image(compositeList.get(idx.add(1))).select('NDVI');
        var defor = ndviT.subtract(ndviT1).gt(CONFIG.ndviThreshold).updateMask(ndviT.gt(0.3));
        return defor.rename('deforestation').set('year_from', y);
    })
);

    // [FIX] Menghindari list.map untuk reduceRegion agar tabel tidak kosong
var deforValidationStats = deforestationMaps.map(function (img) {
    var y = ee.Number(img.get('year_from'));
    // Lossyear Hansen: lossyear = year - 2000. Untuk transisi NDVI T→T+1, lossyear yang sesuai adalah T+1
    var gfwLoss = hansenGFC.select('lossyear').eq(y.subtract(1999));
    var stats = ee.Image.cat([img.rename('NDVI_Defor'), gfwLoss.rename('GFW_Loss'), img.and(gfwLoss).rename('Overlap')])
        .multiply(ee.Image.pixelArea()).divide(10000).reduceRegion({
            reducer: ee.Reducer.sum(), geometry: jambiROI, scale: 300, maxPixels: CONFIG.MAX_PIXELS, bestEffort: true
        });
    // [FIX] Label transisi diubah menjadi y - y+1
    return ee.Feature(null, stats).set('Year_Transition', y.format('%d').cat('-').cat(y.add(1).format('%d')));
});

// TAHAP 3: FIRE OCCURRENCE & BURN SEVERITY
var yearlyHotspots = ee.ImageCollection(years.map(function (y) {
    y = ee.Number(y);
    var start = ee.Date.fromYMD(y, 1, 1);
    var end = ee.Date.fromYMD(y.add(1), 1, 1);
    var modisActive = modisFire.filterDate(start, end).select('FireMask').map(function (img) { return img.gte(7); }).sum();
    var viirsActive = firms.filterDate(start, end).select('T21').map(function (img) { return img.gt(0); }).sum();

    // [FIX] Penghapusan .gt(0) agar outputnya berupa densitas, bukan sekadar kehadiran
    return modisActive.add(viirsActive).rename('hotspot_count').clip(jambiROI).set('year', y);
}));

var dNBRMaps = ee.ImageCollection(
    ee.List.sequence(CONFIG.startYear, CONFIG.endYear - 1).map(function (y) {
        y = ee.Number(y);
        var idx = y.subtract(CONFIG.startYear);
        var nbrT = ee.Image(compositeList.get(idx)).select('NBR');
        var nbrT1 = ee.Image(compositeList.get(idx.add(1))).select('NBR');
        var dNBR = nbrT.subtract(nbrT1).rename('dNBR');

        // [FIX] Penggunaan threshold yang benar dari CONFIG
        var severity = ee.Image(0).where(dNBR.gte(CONFIG.dNBR_low), 1)
            .where(dNBR.gte(CONFIG.dNBR_moderate), 2)
            .where(dNBR.gte(CONFIG.dNBR_mod_high), 3)
            .where(dNBR.gte(CONFIG.dNBR_high), 4).rename('severity');
        return ee.Image.cat([dNBR, severity]).set('year_from', y);
    })
);

// [FIX] Ekstraksi MCD64A1 menggunakan map native ImageCollection
var burnValidationStats = dNBRMaps.map(function (img) {
    var y = ee.Number(img.get('year_from'));
    var burnImg = img.select('severity').gte(2);

    // [FIX] Menangkap transisi MCD64A1 dengan filter tanggal lintas tahun yang benar
    var mcd = mcd64Burn.filterDate(ee.Date.fromYMD(y, 1, 1), ee.Date.fromYMD(y.add(2), 1, 1))
        .select('BurnDate').map(function (m) { return m.gt(0); }).max().unmask(0);

    var stats = ee.Image.cat([burnImg.rename('dNBR_Area'), mcd.rename('MCD64_Area'), burnImg.and(mcd).rename('Burn_Overlap')])
        .multiply(ee.Image.pixelArea()).divide(10000).reduceRegion({
            reducer: ee.Reducer.sum(), geometry: jambiROI, scale: 500, maxPixels: CONFIG.MAX_PIXELS, bestEffort: true
        });
    return ee.Feature(null, stats).set('Year_Transition', y.format('%d').cat('-').cat(y.add(1).format('%d')));
});

// ── VERIFIKASI: NDVI Time-series 2020-2024 ──
print('');
print('═══════ NDVI TIME-SERIES 2020-2024 ═══════');
for (var n = CONFIG.startYear; n <= CONFIG.endYear; n++) {
    var ndviImg = ee.Image(yearlyComposites.filter(ee.Filter.eq('year', n)).first()).select('NDVI');
    var ndviStats = ndviImg.reduceRegion({
        reducer: ee.Reducer.mean().combine(ee.Reducer.minMax(), '', true),
        geometry: jambiROI, scale: 1000, maxPixels: 1e7, bestEffort: true
    });
    print(n + ' → mean:', ndviStats.get('NDVI_mean'),
        'min:', ndviStats.get('NDVI_min'),
        'max:', ndviStats.get('NDVI_max'));
}
// Tampilkan NDVI 2024 di Map untuk cek spasial
Map.addLayer(
    ee.Image(yearlyComposites.filter(ee.Filter.eq('year', 2024)).first()).select('NDVI'),
    { min: 0, max: 1, palette: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850'] },
    'NDVI 2024', true
);

// 4. EKSPOR (RASTER KE ASSETS, CSV KE DRIVE)
print('Silakan klik tab "Tasks". Tabel statistik dikembalikan ke Drive demi stabilitas ekstraksi Area.');

// Ekspor Tabel dipindah ke Drive sesuai Task Compliance
Export.table.toDrive({ collection: deforValidationStats, description: 'Task_Stats_Deforestasi_Drive', folder: 'GEE_FireDrone_Jambi_v3', fileFormat: 'CSV' });
Export.table.toDrive({ collection: burnValidationStats, description: 'Task_Stats_Burn_Drive', folder: 'GEE_FireDrone_Jambi_v3', fileFormat: 'CSV' });

for (var yr = CONFIG.startYear; yr < CONFIG.endYear; yr++) {
    var deforExp = ee.Image(deforestationMaps.filter(ee.Filter.eq('year_from', yr)).first());
    var dNBRExp = ee.Image(dNBRMaps.filter(ee.Filter.eq('year_from', yr)).first()).select('severity');

    Export.image.toAsset({ image: deforExp, description: 'Task_Deforestasi_' + yr, assetId: CONFIG.assetPath + 'Deforestasi_' + yr, scale: CONFIG.exportScale, region: jambiROI, maxPixels: CONFIG.MAX_PIXELS });
    Export.image.toAsset({ image: dNBRExp, description: 'Task_BurnSeverity_' + yr, assetId: CONFIG.assetPath + 'BurnSeverity_' + yr, scale: CONFIG.exportScale, region: jambiROI, maxPixels: CONFIG.MAX_PIXELS });
}

years.evaluate(function (yearList) {
    yearList.forEach(function (yr) {
        var hsExp = ee.Image(yearlyHotspots.filter(ee.Filter.eq('year', yr)).first());
        Export.image.toAsset({ image: hsExp.toFloat(), description: 'Task_Hotspot_' + yr, assetId: CONFIG.assetPath + 'Hotspot_' + yr, scale: CONFIG.hotspotExportScale, region: jambiROI, maxPixels: CONFIG.MAX_PIXELS });
    });
});

// ═══════════ VERIFICATION BLOCK ═══════════
print('═══════════ VERIFIKASI OUTPUT ═══════════');

// 1. CEK JUMLAH — Pastikan semua collection tidak kosong
print('1. JUMLAH KOLEKSI:');
print('  Komposit:', yearlyComposites.size(), '(harus 6: 2020-2025)');
print('  Deforestasi:', deforestationMaps.size(), '(harus 5: 2020→2021 s.d. 2024→2025)');
print('  dNBR maps:', dNBRMaps.size(), '(harus 5)');
print('  Hotspot:', yearlyHotspots.size(), '(harus 6: 2020-2025)');
print('  Stats Defor:', deforValidationStats.size(), '(harus 5)');
print('  Stats Burn:', burnValidationStats.size(), '(harus 5)');

// 2. CEK NILAI — Sample statistik dari 2020
var s2020 = ee.Image(compositeList.get(0)).select('NDVI');
var ndviStat = s2020.reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.minMax(), '', true),
    geometry: jambiROI, scale: 1000, maxPixels: 1e7, bestEffort: true
});
print('2. NDVI 2020 (mean/min/max):', ndviStat);
print('   → Mean harus 0.4-0.8, min <0.1, max >0.7');

// 3. CEK AREA DEFORESTASI — Pastikan ada nilai
var dArea = ee.Image(deforestationMaps.first())
    .multiply(ee.Image.pixelArea()).divide(10000)
    .reduceRegion({ reducer: ee.Reducer.sum(), geometry: jambiROI, scale: 300, maxPixels: 1e9, bestEffort: true });
print('3. Deforestasi 2020-2021 (ha):', dArea, '→ harus >0');

// 4. CEK BURN HISTOGRAM — Verifikasi distribusi severity
var bHist = ee.Image(dNBRMaps.first()).select('severity')
    .reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: jambiROI, scale: 300, maxPixels: 1e9, bestEffort: true });
print('4. Burn histogram 2020-2021:', bHist);
print('   → Harus ada data di beberapa kelas (0=unburned dominan, 1-4 ada)');

// 5. CEK HOTSPOT — Pastikan bukan 0 semua
var hMax = ee.Image(yearlyHotspots.first())
    .reduceRegion({ reducer: ee.Reducer.max(), geometry: jambiROI, scale: 3000, maxPixels: 1e7, bestEffort: true });
print('5. Hotspot 2020 max count:', hMax, '→ harus >0');

// Tampilkan NDVI semua tahun di Map (default off, nyalakan satu-satu)
var ndviVis = { min: 0, max: 1, palette: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850'] };
for (var m = CONFIG.startYear; m <= CONFIG.endYear; m++) {
    Map.addLayer(
        ee.Image(yearlyComposites.filter(ee.Filter.eq('year', m)).first()).select('NDVI'),
        ndviVis, 'NDVI ' + m, false);
}
