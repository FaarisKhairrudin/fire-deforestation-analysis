// ======================================================
// DEBUG COMPOSITE 2018 vs 2019
// ======================================================

// 2. PREPROCESSING & SENSOR FUSION DENGAN BLUE BAND GATING

function maskLandsat(img) {
    // Bitmask standar untuk membuang fill, awan, bayangan awan, dan cirrus
    var qaMask = img.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);

    var scaled = img.updateMask(qaMask)
        .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'])
        .multiply(0.0000275).add(-0.2).toFloat();

    // [RAHASIA PEMBERSIH AWAN]: Blue Band Gating (< 0.20)
    // Membuang sisa asap, kabut cyan, dan tepi awan yang lolos dari QA_PIXEL
    var cloudGate = scaled.select('SR_B2').lt(0.20);
    scaled = scaled.updateMask(cloudGate);

    var ndvi = scaled.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    var nbr = scaled.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');

    return scaled.addBands([ndvi, nbr]).copyProperties(img, ['system:time_start']);
}

function maskSentinel(img) {
    var scl = img.select('SCL');

    // [FIX] Whitelist super ketat: HANYA Vegetasi (4) dan Tanah Terbuka (5)
    // Kelas 2 (Dark area) dan Kelas 6 (Water) dibuang agar bayangan awan tidak masuk
    var qaMask = scl.eq(4).or(scl.eq(5));

    var scaled = img.updateMask(qaMask)
        .select(['B2', 'B3', 'B4', 'B8', 'B12']).divide(10000).toFloat()
        .rename(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7']);

    // [RAHASIA PEMBERSIH AWAN]: Blue Band Gating (< 0.20)
    // Membunuh bercak putih/cyan dari tepi awan yang salah diklasifikasikan sebagai tanah (SCL=5)
    var cloudGate = scaled.select('SR_B2').lt(0.20);
    scaled = scaled.updateMask(cloudGate);

    var ndvi = scaled.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    var nbr = scaled.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');

    return scaled.addBands([ndvi, nbr]).copyProperties(img, ['system:time_start']);
}

var gaul = ee.FeatureCollection('FAO/GAUL/2015/level1');
var studyArea = gaul.filter(ee.Filter.eq('ADM1_NAME', 'Jambi'));

// ---------- RGB / False Color Params ----------
var rgb = { bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.3 };
var falseColor = { bands: ['SR_B5', 'SR_B4', 'SR_B3'], min: 0, max: 0.5 };

function buildComposites(year, label) {
    year = ee.Number(year);
    var start = ee.Date.fromYMD(year, 1, 1);
    var end = start.advance(1, 'year');

    var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterBounds(studyArea).filterDate(start, end).map(maskLandsat);
    var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
        .filterBounds(studyArea).filterDate(start, end).map(maskLandsat);
    var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(studyArea).filterDate(start, end).map(maskSentinel);

    var l8Comp = l8.median().clip(studyArea);
    var l9Comp = l9.median().clip(studyArea);
    var s2Comp = s2.median().clip(studyArea);

    var mergedComp = l8.merge(l9).merge(s2).median().clip(studyArea);

    print(label + ' | Landsat 8:', l8.size(), '| Sentinel-2:', s2.size());

    // Map layers
    Map.addLayer(l8Comp, rgb, label + ' L8 RGB', false);
    Map.addLayer(l8Comp, falseColor, label + ' L8 False Color', false);
    Map.addLayer(s2Comp, rgb, label + ' S2 RGB', false);
    Map.addLayer(s2Comp, falseColor, label + ' S2 False Color', false);
    Map.addLayer(mergedComp, rgb, label + ' Merged RGB', false);
    Map.addLayer(mergedComp, falseColor, label + ' Merged False Color', false);

    // NDVI display
    var ndvi = mergedComp.normalizedDifference(['SR_B5', 'SR_B4']);
    Map.addLayer(ndvi, { min: -0.2, max: 1, palette: ['white', 'yellow', 'orange', 'green', 'darkgreen'] }, label + ' NDVI', false);

    // Stats
    var ndviMean = mergedComp.select('NDVI').reduceRegion({
        reducer: ee.Reducer.mean(), geometry: studyArea, scale: 30, maxPixels: 1e13, bestEffort: true
    });
    print(label + ' NDVI mean:', ndviMean.get('NDVI'));

    return { l8Comp: l8Comp, s2Comp: s2Comp, mergedComp: mergedComp };
}

Map.centerObject(studyArea, 8);

var comp2016 = buildComposites(2016, '2016');
var comp2018 = buildComposites(2018, '2018');
var comp2019 = buildComposites(2019, '2019');
var comp2020 = buildComposites(2020, '2020');
var comp2021 = buildComposites(2021, '2021');
var comp2022 = buildComposites(2022, '2022');
var comp2025 = buildComposites(2025, '2025');
