// =====================================================================
// FIRE-DRONE: Tahap 4 - Spatial Relationship Analysis (FINAL VISUALIZATION)
// Wilayah Studi: Provinsi Jambi, Indonesia (2020-2025)
// =====================================================================

var CONFIG = {
    provinceName: 'Jambi',
    startYear: 2016,
    endYear: 2025,

    // Path Assets milikmu
    assetPath: 'users/faarisnew/fire-drone-2026-v2/',

    exportScale: 30,
    exportCRS: 'EPSG:32648',
    bufferRadius: 1000,
    MAX_PIXELS: 1e13,
    driveFolder: 'GEE_FireDrone_Jambi_Final'
};

// 1. REGION OF INTEREST
var gaul = ee.FeatureCollection('FAO/GAUL/2015/level1');
var jambiROI = gaul.filter(ee.Filter.eq('ADM1_NAME', CONFIG.provinceName));

var yearsClient = [];
for (var i = CONFIG.startYear; i < CONFIG.endYear; i++) {
    yearsClient.push(i);
}

// 2. SPATIAL OVERLAY & BUFFER ANALYSIS
var clearingList = yearsClient.map(function (y) {
    var defor = ee.Image(CONFIG.assetPath + 'Deforestasi_' + y).unmask(0);
    var burn = ee.Image(CONFIG.assetPath + 'BurnSeverity_' + y).unmask(0);
    var hotspot = ee.Image(CONFIG.assetPath + 'Hotspot_' + y).unmask(0);

    var hotspotBuffer = hotspot.gt(0).focal_max({
        radius: CONFIG.bufferRadius,
        units: 'meters'
    });

    var isBurned = burn.gte(2).and(hotspotBuffer.eq(1));
    var burningClearing = defor.eq(1).and(isBurned);
    var mechanicalClearing = defor.eq(1).and(isBurned.not());

    var clearingClass = ee.Image(0)
        .where(mechanicalClearing, 1)
        .where(burningClearing, 2)
        .updateMask(defor.eq(1))
        .rename('clearing_type')
        .addBands(defor.rename('defor'))
        .addBands(hotspotBuffer.rename('hotspotBuffer'))
        .addBands(burn.gte(2).rename('burnGte2'))
        .set('year_from', y);

    return clearingClass;
});

var clearingAnalysis = ee.ImageCollection(clearingList);

// 3. EKSTRAKSI METRIK STATISTIK
var spatialMetrics = clearingAnalysis.map(function (img) {
    var y = ee.Number(img.get('year_from'));

    var mechAreaImg = img.select('clearing_type').eq(1).multiply(ee.Image.pixelArea()).divide(10000);
    var burnAreaImg = img.select('clearing_type').eq(2).multiply(ee.Image.pixelArea()).divide(10000);
    var totalDeforImg = img.select('clearing_type').gt(0).multiply(ee.Image.pixelArea()).divide(10000);

    var defor = img.select('defor');
    var hotspotBuffer = img.select('hotspotBuffer');
    var burnGte2 = img.select('burnGte2');

    var deforInHotspot = defor.eq(1).and(hotspotBuffer.eq(1))
        .multiply(ee.Image.pixelArea()).divide(10000).rename('Area_Defor_in_Hotspot_ha');
    var deforWithBurn = defor.eq(1).and(burnGte2.eq(1))
        .multiply(ee.Image.pixelArea()).divide(10000).rename('Area_Defor_with_Burn_ha');

    var stats = ee.Image.cat([mechAreaImg.rename('Area_Mechanical_ha'),
    burnAreaImg.rename('Area_Burning_ha'),
    totalDeforImg.rename('Area_Total_Defor_ha'),
        deforInHotspot,
        deforWithBurn])
        .reduceRegion({
            reducer: ee.Reducer.sum(),
            geometry: jambiROI,
            scale: CONFIG.exportScale,
            maxPixels: CONFIG.MAX_PIXELS,
            tileScale: 16,
            bestEffort: true
        });

    return ee.Feature(null, stats).set('Year_Transition', y.format('%d').cat('-').cat(y.add(1).format('%d')));
});


// =====================================================================
// 4. VISUALISASI INTERAKTIF DI MAP GEE
// =====================================================================

Map.centerObject(jambiROI, 8);
Map.setOptions('HYBRID');

// A. PETA DASAR (BASEMAP) NDVI JAMBI 2020
var ndviBase = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    .filterBounds(jambiROI)
    .filterDate('2020-01-01', '2020-12-31')
    .map(function (img) {
        return img.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    })
    .median()
    .clip(jambiROI);

var visNDVI = {
    min: 0.3,
    max: 0.8,
    palette: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'],
    opacity: 0.5
};
Map.addLayer(ndviBase, visNDVI, '0. Base NDVI Jambi (2020)', true);


// B. LOOPING VISUALISASI UNTUK SEMUA TAHUN
var visClearing = { min: 1, max: 2, palette: ['#fec44f', '#de2d26'] };
var visRGB = { min: 0.0, max: 0.15, gamma: 1.3 }; // Parameter warna natural

yearsClient.forEach(function (y) {
    var transLabel = y + '-' + (y + 1);

    var mapFinal = ee.Image(clearingAnalysis.filter(ee.Filter.eq('year_from', y)).first());
    var deforImg = ee.Image(CONFIG.assetPath + 'Deforestasi_' + y).unmask(0);
    var burnImg = ee.Image(CONFIG.assetPath + 'BurnSeverity_' + y).unmask(0);
    var hotspotImg = ee.Image(CONFIG.assetPath + 'Hotspot_' + y).unmask(0);
    var hsBuffer = hotspotImg.gt(0).focal_max({ radius: CONFIG.bufferRadius, units: 'meters' });

    // [TAMBAHAN VISUAL]: Menarik Citra Asli Landsat (RGB) untuk tahun tersebut
    var rgbBase = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .filterBounds(jambiROI)
        .filterDate(y + '-01-01', y + '-12-31')
        .map(function (img) {
            var qaMask = img.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
            return img.updateMask(qaMask).select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2);
        })
        .median()
        .clip(jambiROI);

    var showLayer = (y === 2023);

    // Menambahkan susunan layer dari bawah ke atas
    // Peta RGB ditaruh di urutan paling bawah per tahun agar bisa jadi background
    Map.addLayer(rgbBase, visRGB, '  [BUKTI ASLI] Satelit RGB ' + y, false);
    Map.addLayer(deforImg.updateMask(deforImg.eq(1)), { palette: ['#ffffff'] }, '  └ Base Deforestasi (' + transLabel + ')', false);
    Map.addLayer(hsBuffer.updateMask(hsBuffer.eq(1)), { palette: ['#ff00ff'], opacity: 0.25 }, '  └ Hotspot Buffer 1km (' + transLabel + ')', false);
    Map.addLayer(burnImg.updateMask(burnImg.gte(2)), { min: 2, max: 4, palette: ['#fd8d3c', '#f03b20', '#bd0026'] }, '  └ Burn Severity (' + transLabel + ')', false);
    Map.addLayer(mapFinal.updateMask(mapFinal.gt(0)), visClearing, '★ FINAL Clearing Type ' + transLabel, showLayer);
});


// =====================================================================
// 5. EXPORT TASKS KE GOOGLE DRIVE
// =====================================================================

print('Visualisasi aktif. Buka panel "Layers" di kanan atas peta untuk menceklis tahun lainnya.');

Export.table.toDrive({
    collection: spatialMetrics,
    description: 'Tahap4_Clearing_Transition_Stats',
    folder: CONFIG.driveFolder,
    fileFormat: 'CSV'
});

yearsClient.forEach(function (yr) {
    var finalMap = ee.Image(clearingAnalysis.filter(ee.Filter.eq('year_from', yr)).first());
    Export.image.toDrive({
        image: finalMap,
        description: 'Tahap4_ClearingType_Map_' + yr + '_' + (yr + 1),
        folder: CONFIG.driveFolder,
        scale: CONFIG.exportScale,
        region: jambiROI,
        maxPixels: CONFIG.MAX_PIXELS
    });
});
