// ═══════════════════════════════════════════════════════════════════════
// FIRE-DRONE: Analisis Spasio-Temporal GEE — Tahap 1-3
// Wilayah Studi: Provinsi Jambi, Indonesia (2020-2024)
// Sensor: Landsat 8 & 9 Collection 2 Level-2 (30m)
// =====================================================================
// Tahap 1: Data Acquisition & Preprocessing (cloud masking, annual composite)
// Tahap 2: Forest Cover Change & Deforestation Detection (NDVI diff, GFW)
// Tahap 3: Fire Occurrence & Burn Severity (FIRMS hotspot, dNBR, MCD64A1)
// ═══════════════════════════════════════════════════════════════════════


// ╔══════════════════════════════════════════════════════════════════════╗
// ║              PARAMETER KONFIGURASI (UBAH SESUAI KEBUTUHAN)          ║
// ╚══════════════════════════════════════════════════════════════════════╝

var CONFIG = {
  // --- Wilayah & Waktu ---
  provinceName: 'Jambi',
  startYear: 2020,
  endYear: 2024,

  // --- Threshold Deteksi Deforestasi ---
  ndviDeclineThreshold: 0.2,

  // --- Hansen Global Forest Change ---
  gfwMinLossYear: 20,
  gfwMaxLossYear: 24,

  // --- Ekspor ---
  exportScale: 30,
  exportCRS: 'EPSG:32648',
  driveFolder: 'GEE_FireDrone_Jambi',

  // --- Visualisasi ---
  visNDVI: { min: 0, max: 1, palette: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850'] },
  visLandsat: { bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.3, gamma: 1.4 },
  visBurn: { min: 0, max: 4, palette: ['#006400', '#7ecb00', '#ffff00', '#ff9900', '#ff0000'] },
  visHotspot: { min: 0, max: 50, palette: ['#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c'] },

  // --- dNBR Burn Severity (USGS standard) ---
  dNBR_low: 0.1,
  dNBR_moderate: 0.27,
  dNBR_high: 0.66,

  // --- Hotspot ---
  hotspotExportScale: 375
};


// ╔══════════════════════════════════════════════════════════════════════╗
// ║   TAHAP 1 A: DATA ACQUISITION — PEMILIHAN DATASET                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

print('╔═══════════════════════════════════════════════════════╗');
print('║   TA H A P   1   —   A K U I S I S I   D A T A     ║');
print('╚═══════════════════════════════════════════════════════╝');
print('Provinsi:', CONFIG.provinceName, '|', CONFIG.startYear + '-' + CONFIG.endYear);

// ── 1. Region of Interest (ROI): Batas Administrasi Jambi ──
var gaul = ee.FeatureCollection('FAO/GAUL/2015/level1');
var jambiROI = gaul.filter(ee.Filter.eq('ADM1_NAME', CONFIG.provinceName));

print('Dataset: FAO/GAUL/2015/level1 — Batas Provinsi Jambi');
print('Jumlah fitur:', jambiROI.size());

Map.centerObject(jambiROI, 8);
Map.addLayer(jambiROI, { color: 'red', width: 2 }, 'ROI: Jambi');

// ── 2. Citra Optik Utama: Landsat 8 & 9 Collection 2 Level-2 ──
var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(jambiROI);
var landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(jambiROI);
var landsatAll = landsat8.merge(landsat9);

print('Dataset: LANDSAT/LC08/C02/T1_L2 + LANDSAT/LC09/C02/T1_L2');
print('  → Landsat 8 (LC08) citra tersedia:', landsat8.size());
print('  → Landsat 9 (LC09) citra tersedia:', landsat9.size());
print('  → Total citra (filtered by ROI):', landsatAll.size());

// ── 3. Data Validasi: Hansen Global Forest Change v1.13 (2025) ──
var hansenGFC = ee.Image('UMD/hansen/global_forest_change_2025_v1_13');

print('Dataset: UMD/hansen/global_forest_change_2025_v1_13');
print('  → Band tersedia:', hansenGFC.bandNames());
print('  → Rentang lossyear: 1 (2001) - 25 (2025)');

// ── 4. Titik Api & Hotspot (untuk referensi, akan digunakan di Tahap 3) ──
var firms = ee.ImageCollection('FIRMS').filterBounds(jambiROI);
var modisFire = ee.ImageCollection('MODIS/061/MOD14A1').filterBounds(jambiROI);
var modisBurn = ee.ImageCollection('MODIS/061/MCD64A1').filterBounds(jambiROI);

print('Dataset pendukung (persiapan Tahap 3):');
print('  → FIRMS aktif:', firms.limit(1).size());
print('  → MODIS/061/MOD14A1 aktif:', modisFire.limit(1).size());
print('  → MODIS/061/MCD64A1 terbakar:', modisBurn.limit(1).size());


// ╔══════════════════════════════════════════════════════════════════════╗
// ║   TAHAP 1 B: PREPROCESSING — CLOUD MASKING & INDEKS SPECTRAL        ║
// ╚══════════════════════════════════════════════════════════════════════╝

print('');
print('--- TAHAP 1 B: PREPROCESSING ---');

// ── Cloud Masking Landsat Collection 2 Level-2 ──
// QA_PIXEL bit: 0=Fill, 1=DilatedCloud, 2=Cirrus, 3=Cloud, 4=CloudShadow
function maskLandsat(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Scale SR bands: DN → reflectance
  var scaled = image.select('SR_B.*').multiply(0.0000275).add(-0.2);

  return image
    .addBands(scaled, null, true)
    .updateMask(qaMask)
    .updateMask(saturationMask);
}

// ── Tambah Indeks Spektral (NDVI, NBR) ──
function addIndices(image) {
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  var nbr = image.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');
  return image.addBands(ndvi).addBands(nbr);
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║   TAHAP 1 C: ANNUAL MEDIAN COMPOSITE GENERATION                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

print('');
print('--- TAHAP 1 C: MEMBANGUN KOMPOSIT TAHUNAN ---');

var years = ee.List.sequence(CONFIG.startYear, CONFIG.endYear);

function buildAnnualComposite(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = ee.Date.fromYMD(year.add(1), 1, 1);

  // Filter → cloud mask → tambah indeks → median → clip
  var composite = landsatAll
    .filterDate(start, end)
    .map(maskLandsat)
    .map(addIndices)
    .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'NDVI', 'NBR'])
    .median()
    .clip(jambiROI);

  var sceneCount = landsatAll
    .filterDate(start, end)
    .map(maskLandsat)
    .select('SR_B4').count().rename('sceneCount');

  return composite
    .addBands(sceneCount)
    .set('year', year)
    .set('system:time_start', start.millis())
    .set('system:time_end', end.millis());
}

var yearlyComposites = ee.ImageCollection(
  years.map(function(y) { return buildAnnualComposite(y); })
);

print('Jumlah komposit tahunan:', yearlyComposites.size());
print('Band:', yearlyComposites.first().bandNames());

// ── Tampilkan komposit ke Map ──
var c2020 = ee.Image(yearlyComposites.filter(ee.Filter.eq('year', 2020)).first());
var c2024 = ee.Image(yearlyComposites.filter(ee.Filter.eq('year', 2024)).first());

Map.addLayer(c2020, CONFIG.visLandsat, 'Landsat RGB 2020', false);
Map.addLayer(c2024, CONFIG.visLandsat, 'Landsat RGB 2024', false);
Map.addLayer(c2020.select('NDVI'), CONFIG.visNDVI, 'NDVI 2020', false);
Map.addLayer(c2024.select('NDVI'), CONFIG.visNDVI, 'NDVI 2024', false);


// ╔══════════════════════════════════════════════════════════════════════╗
// ║   TA H A P   2   —   F O R E S T   C O V E R   C H A N G E       ║
// ╚══════════════════════════════════════════════════════════════════════╝

print('');
print('╔═══════════════════════════════════════════════════════╗');
print('║   TA H A P   2   —   D E F O R E S T A S I         ║');
print('╚═══════════════════════════════════════════════════════╝');

// ── 2A. NDVI diff antar tahun (Year t vs Year t+1) ──
var compositeList = yearlyComposites.sort('year').toList(CONFIG.endYear - CONFIG.startYear + 1);

var deforestationMaps = ee.ImageCollection(
  ee.List.sequence(CONFIG.startYear, CONFIG.endYear - 1).map(function(year) {
    year = ee.Number(year);
    var idx = year.subtract(CONFIG.startYear);

    var imgT  = ee.Image(compositeList.get(idx));
    var imgT1 = ee.Image(compositeList.get(idx.add(1)));

    var ndviT  = imgT.select('NDVI');
    var ndviT1 = imgT1.select('NDVI');

    // dNDVI = NDVI(t) - NDVI(t+1) > threshold → deforestasi
    var deforestation = ndviT.subtract(ndviT1).gt(CONFIG.ndviDeclineThreshold);

    // Mask: hanya area dengan vegetasi awal (NDVI > 0.3)
    deforestation = deforestation.updateMask(ndviT.gt(0.3));

    return deforestation
      .rename('deforestation')
      .set('year_from', year)
      .set('year_to', year.add(1));
  })
);

// ── Tampilkan contoh deforestasi 2020-2021 ──
var defor2020 = ee.Image(deforestationMaps.filter(ee.Filter.eq('year_from', 2020)).first());
Map.addLayer(defor2020.selfMask(), { palette: ['#d73027'] }, 'Deforestasi 2020-2021', false);

// ── 2B. Integrasi Hansen GFW untuk validasi ──
// lossyear: 20=2020, 21=2021, 22=2022, 23=2023, 24=2024
var gfwLossMask = hansenGFC.select('lossyear')
  .gte(CONFIG.gfwMinLossYear)
  .and(hansenGFC.select('lossyear').lte(CONFIG.gfwMaxLossYear));

Map.addLayer(gfwLossMask.selfMask(), { palette: ['#f46d43'] }, 'GFW Loss 2020-2024', false);

// ── 2C. Validasi spasial NDVI vs GFW ──
print('');
print('→ Membuat peta validasi per tahun...');

var valStack = null;
for (var vy = CONFIG.startYear; vy <= CONFIG.endYear - 1; vy++) {
  var vx = vy - CONFIG.startYear;
  var ndviT  = ee.Image(compositeList.get(vx)).select('NDVI');
  var ndviT1 = ee.Image(compositeList.get(vx + 1)).select('NDVI');
  var ndviDef = ndviT.subtract(ndviT1).gt(CONFIG.ndviDeclineThreshold).updateMask(ndviT.gt(0.3));
  var gfwLoss = hansenGFC.select('lossyear').eq(vy - 1999);
  var overlap = ndviDef.and(gfwLoss);

  // Band names unique per tahun
  var defName = 'ndvi_' + vy;
  var gfwName = 'gfw_' + (vy + 1);
  var ovlName = 'ovl_' + vy;

  var valImg = ee.Image.cat([
    ndviDef.rename(defName),
    gfwLoss.rename(gfwName),
    overlap.rename(ovlName)
  ]).toFloat();

  valStack = valStack === null ? valImg : valStack.addBands(valImg);

  // Export validation raster per tahun
  Export.image.toDrive({
    image: valImg,
    description: 'Jambi_Validation_' + vy,
    folder: CONFIG.driveFolder,
    fileNamePrefix: 'Jambi_Validation_' + vy,
    region: jambiROI,
    scale: CONFIG.exportScale,
    crs: CONFIG.exportCRS,
    maxPixels: 1e9
  });

  // Hitung area (resolusi 300m biar cepat)
  var areaSum = valImg.multiply(ee.Image.pixelArea()).divide(10000)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: jambiROI,
      scale: 300,
      maxPixels: 1e9,
      bestEffort: true
    });
  print('  Area ' + vy + ' (ha) → Def:', areaSum.get(defName),
        'GFW:', areaSum.get(gfwName), 'Overlap:', areaSum.get(ovlName));
}

print('→ Semua rasters validasi siap di-export (tab Tasks).');

// Compute area dictionary for CSV export
var areasDict = valStack.multiply(ee.Image.pixelArea()).divide(10000)
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: jambiROI,
    scale: 300,
    maxPixels: 1e9,
    bestEffort: true
  });
print('→ Area stats (ha):', areasDict);

// Build single-row table for CSV export
var csvRow = ee.Feature(null, areasDict);
var csvTable = ee.FeatureCollection([csvRow]);


// ╔══════════════════════════════════════════════════════════════════════╗
// ║   TA H A P   3   —   F I R E   &   B U R N                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

print('');
print('╔═══════════════════════════════════════════════════════╗');
print('║   TA H A P   3   —   F I R E   &   B U R N         ║');
print('╚═══════════════════════════════════════════════════════╝');


// ── 3A. FIRMS Hotspot Density (annual) ──
print('→ 3A: Membuat peta densitas hotspot tahunan...');

function buildHotspotDensity(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = ee.Date.fromYMD(year.add(1), 1, 1);

  var density = firms
    .filterDate(start, end)
    .select('T21')
    .map(function(img) { return img.gt(0).unmask(0); })
    .sum()
    .rename('hotspot_count')
    .clip(jambiROI);

  return density.set('year', year);
}

var yearlyHotspots = ee.ImageCollection(
  years.map(function(y) { return buildHotspotDensity(y); })
);

// Visualisasi hotspot 2024
var hotspot2024 = ee.Image(yearlyHotspots.filter(ee.Filter.eq('year', 2024)).first());
Map.addLayer(hotspot2024, CONFIG.visHotspot, 'Hotspot Density 2024', false);

// Hitung total hotspot count (console)
for (var h = CONFIG.startYear; h <= CONFIG.endYear; h++) {
  var hsImg = ee.Image(yearlyHotspots.filter(ee.Filter.eq('year', h)).first());
  var hsSum = hsImg.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: jambiROI,
    scale: CONFIG.hotspotExportScale,
    maxPixels: 1e9,
    bestEffort: true
  });
  print('  Total hotspot ' + h + ':', hsSum.get('hotspot_count'));
}


// ── 3B. dNBR & Burn Severity Classification ──
print('→ 3B: Menghitung dNBR dan klasifikasi burn severity...');

var dNBRMaps = ee.ImageCollection(
  ee.List.sequence(CONFIG.startYear, CONFIG.endYear - 1).map(function(year) {
    year = ee.Number(year);
    var idx = year.subtract(CONFIG.startYear);

    var nbrT  = ee.Image(compositeList.get(idx)).select('NBR');
    var nbrT1 = ee.Image(compositeList.get(idx.add(1))).select('NBR');

    // dNBR = NBR(pre) - NBR(post), positive = burn
    var dNBR = nbrT.subtract(nbrT1).rename('dNBR');

    // USGS burn severity classification
    // 0=Unburned/Regrowth, 1=Low, 2=Moderate-Low, 3=Moderate-High, 4=High
    var severity = ee.Image(0).where(dNBR.gte(CONFIG.dNBR_low), 1)
                              .where(dNBR.gte(CONFIG.dNBR_moderate), 2)
                              .where(dNBR.gte(CONFIG.dNBR_high), 3)
                              .where(dNBR.gte(0.66), 4)
                              .rename('severity');

    return ee.Image.cat([dNBR, severity])
      .set('year_from', year)
      .set('year_to', year.add(1));
  })
);

// Visualisasi burn severity 2023-2024
var burn2023_24 = ee.Image(dNBRMaps.filter(ee.Filter.eq('year_from', 2023)).first());
Map.addLayer(burn2023_24.select('severity'), CONFIG.visBurn, 'Burn Severity 2023-2024', false);
Map.addLayer(burn2023_24.select('dNBR'), {min: -0.5, max: 1, palette: ['#1a9850','#d9ef8b','#fee08b','#fc8d59','#d73027']}, 'dNBR 2023-2024', false);

// Area stats for dNBR
for (var b = CONFIG.startYear; b < CONFIG.endYear; b++) {
  var burnImg = ee.Image(dNBRMaps.filter(ee.Filter.eq('year_from', b)).first());
  var burnStats = burnImg.select('severity').reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: jambiROI,
    scale: CONFIG.exportScale,
    maxPixels: 1e9,
    bestEffort: true
  });
  print('  Burn severity histogram ' + b + '-' + (b+1) + ':', burnStats.get('severity'));
}


// ── 3C. MCD64A1 MODIS Burned Area Cross-check ──
print('→ 3C: Cross-check dengan MODIS Burned Area (MCD64A1)...');

function buildMCD64Mask(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = ee.Date.fromYMD(year.add(1), 1, 1);

  var mask = modisBurn
    .filterDate(start, end)
    .select('BurnDate')
    .map(function(img) { return img.gt(0).unmask(0); })
    .max()
    .rename('mcd64_burned')
    .clip(jambiROI);

  return mask.set('year', year);
}

var yearlyMCD64 = ee.ImageCollection(
  years.map(function(y) { return buildMCD64Mask(y); })
);

// Visualisasi MCD64A1 2024
var mcd2024 = ee.Image(yearlyMCD64.filter(ee.Filter.eq('year', 2024)).first());
Map.addLayer(mcd2024.selfMask(), { palette: ['#e31a1c'] }, 'MCD64A1 Burned 2024', false);

// Cross-check area
for (var b2 = CONFIG.startYear; b2 < CONFIG.endYear; b2++) {
  var burnImg2 = ee.Image(dNBRMaps.filter(ee.Filter.eq('year_from', b2)).first());
  var mcd = ee.Image(yearlyMCD64.filter(ee.Filter.eq('year', b2 + 1)).first());

  var burnMask = burnImg2.select('severity').gte(2); // moderate+
  var overlap = burnMask.and(mcd.select('mcd64_burned'));

  // Area per metric
  var stats = ee.Image.cat([
    burnMask.rename('dNBR_burned'),
    mcd.select('mcd64_burned').rename('MCD64_burned'),
    overlap.rename('overlap')
  ]).multiply(ee.Image.pixelArea()).divide(10000)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: jambiROI,
      scale: 500,
      maxPixels: 1e9,
      bestEffort: true
    });
  print('  Cross-check ' + b2 + '-' + (b2+1) + ' (ha) → dNBR:', stats.get('dNBR_burned'),
        'MCD64:', stats.get('MCD64_burned'), 'Overlap:', stats.get('overlap'));
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║   EXPORT TASKS KE GOOGLE DRIVE                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

print('');
print('--- MEMBUAT EXPORT TASKS ---');
print('Folder Drive:', CONFIG.driveFolder);
print('Task akan muncul di tab "Tasks" → klik Run untuk menjalankan.');
print('');

// ── Export 1: Komposit tahunan (per tahun) ──
years.evaluate(function(yearList) {
  yearList.forEach(function(year) {
    var img = ee.Image(yearlyComposites.filter(ee.Filter.eq('year', year)).first())
      .toFloat();
    Export.image.toDrive({
      image: img,
      description: 'Jambi_Composite_' + year,
      folder: CONFIG.driveFolder,
      fileNamePrefix: 'Jambi_Composite_' + year,
      region: jambiROI,
      scale: CONFIG.exportScale,
      crs: CONFIG.exportCRS,
      maxPixels: 1e9
    });
  });
});

// ── Export 2: Peta deforestasi per transisi ──
for (var yr = CONFIG.startYear; yr < CONFIG.endYear; yr++) {
  var defor = ee.Image(deforestationMaps.filter(ee.Filter.eq('year_from', yr)).first());
  Export.image.toDrive({
    image: defor.rename('deforestasi_' + yr + '_' + (yr + 1)),
    description: 'Jambi_Def_NDVI_' + yr + '_' + (yr + 1),
    folder: CONFIG.driveFolder,
    fileNamePrefix: 'Jambi_Def_NDVI_' + yr + '_' + (yr + 1),
    region: jambiROI,
    scale: CONFIG.exportScale,
    crs: CONFIG.exportCRS,
    maxPixels: 1e9
  });
}

// ── Export 3: GFW forest loss mask ──
Export.image.toDrive({
  image: gfwLossMask.rename('gfw_forest_loss_2020_2024'),
  description: 'Jambi_GFW_Loss_2020_2024',
  folder: CONFIG.driveFolder,
  fileNamePrefix: 'Jambi_GFW_Loss_2020_2024',
  region: jambiROI,
  scale: CONFIG.exportScale,
  crs: CONFIG.exportCRS,
  maxPixels: 1e9
});

// ── Export 4: Tabel statistik validasi (CSV) ──
Export.table.toDrive({
  collection: csvTable,
  description: 'Jambi_Validation_Stats',
  folder: CONFIG.driveFolder,
  fileNamePrefix: 'Jambi_Validation_Stats',
  fileFormat: 'CSV'
});

// ── Export 5: Hotspot density tahunan (FIRMS) ──
years.evaluate(function(yearList) {
  yearList.forEach(function(year) {
    var hs = ee.Image(yearlyHotspots.filter(ee.Filter.eq('year', year)).first());
    Export.image.toDrive({
      image: hs.toFloat(),
      description: 'Jambi_HotspotDensity_' + year,
      folder: CONFIG.driveFolder,
      fileNamePrefix: 'Jambi_HotspotDensity_' + year,
      region: jambiROI,
      scale: CONFIG.hotspotExportScale,
      crs: CONFIG.exportCRS,
      maxPixels: 1e9
    });
  });
});

// ── Export 6: dNBR & burn severity per transisi ──
for (var by = CONFIG.startYear; by < CONFIG.endYear; by++) {
  var burnImg = ee.Image(dNBRMaps.filter(ee.Filter.eq('year_from', by)).first());
  Export.image.toDrive({
    image: burnImg.toFloat(),
    description: 'Jambi_dNBR_BurnSeverity_' + by,
    folder: CONFIG.driveFolder,
    fileNamePrefix: 'Jambi_dNBR_Burn_' + by + '_' + (by + 1),
    region: jambiROI,
    scale: CONFIG.exportScale,
    crs: CONFIG.exportCRS,
    maxPixels: 1e9
  });
}

// ── Export 7: MCD64A1 burned area mask tahunan ──
years.evaluate(function(yearList) {
  yearList.forEach(function(year) {
    var mcd = ee.Image(yearlyMCD64.filter(ee.Filter.eq('year', year)).first());
    Export.image.toDrive({
      image: mcd.toFloat(),
      description: 'Jambi_MCD64_Burned_' + year,
      folder: CONFIG.driveFolder,
      fileNamePrefix: 'Jambi_MCD64_Burned_' + year,
      region: jambiROI,
      scale: 500,
      crs: CONFIG.exportCRS,
      maxPixels: 1e9
    });
  });
});


print('');
print('========================================');
print('SELESAI — Script siap dijalankan.');
print('Output:');
print('  → ' + (CONFIG.endYear - CONFIG.startYear + 1) + ' komposit tahunan (RGB + NDVI + NBR)');
print('  → ' + (CONFIG.endYear - CONFIG.startYear) + ' peta deforestasi NDVI-based');
print('  → 1 mask GFW loss 2020-2024');
print('  → ' + (CONFIG.endYear - CONFIG.startYear) + ' peta validasi (NDVI_defor + GFW_loss + Overlap)');
print('  → 1 tabel CSV statistik area validasi');
print('  → ' + (CONFIG.endYear - CONFIG.startYear + 1) + ' peta densitas hotspot FIRMS');
print('  → ' + (CONFIG.endYear - CONFIG.startYear) + ' peta dNBR + burn severity (USGS)');
print('  → ' + (CONFIG.endYear - CONFIG.startYear + 1) + ' peta MCD64A1 burned area');
print('');
print('Catatan:');
print('  - Threshold NDVI: ' + CONFIG.ndviDeclineThreshold);
print('  - dNBR USGS: Low=' + CONFIG.dNBR_low + ', Mod=' + CONFIG.dNBR_moderate + ', High=' + CONFIG.dNBR_high);
print('  - Resolusi: ' + CONFIG.exportScale + 'm, CRS: ' + CONFIG.exportCRS);
print('  - Ubah parameter di CONFIG (bagian atas) sesuai kebutuhan');
print('========================================');
