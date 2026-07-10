# Metodologi Analisis Spasio-Temporal Kebakaran & Deforestasi
## Provinsi Jambi (2020-2024) — Google Earth Engine

---

## 1. Latar Belakang & Tujuan

Provinsi Jambi merupakan salah satu provinsi di Sumatera dengan tingkat deforestasi dan kebakaran hutan yang signifikan. Analisis ini bertujuan untuk:

- Memetakan perubahan tutupan hutan tahunan
- Mengidentifikasi area deforestasi melalui penurunan indeks vegetasi
- Menghitung kepadatan titik api (hotspot) dari data satelit termal
- Mengukur tingkat keparahan kebakaran (burn severity) menggunakan metode dNBR

Semua pemrosesan dilakukan di Google Earth Engine (GEE) untuk menghindari download data mentah berskala besar.

---

## 2. Wilayah & Periode Studi

| Parameter | Nilai |
|-----------|-------|
| Provinsi | Jambi, Indonesia |
| Rentang waktu | 1 Januari 2020 — 31 Desember 2024 |
| Luas wilayah | ~50.000 km² |
| Sistem proyeksi | EPSG:32648 (UTM Zone 48S) |
| Resolusi ekspor | 30m (Landsat), 375m (hotspot), 500m (MCD64A1) |

Batas administrasi menggunakan dataset global `FAO/GAUL/2015/level1`.

---

## 3. Dataset yang Digunakan

### 3.1 Citra Optik (Utama)

**Landsat 8 & 9 Collection 2 Level-2** (`LANDSAT/LC08/C02/T1_L2` + `LANDSAT/LC09/C02/T1_L2`)

| Spesifikasi | Nilai |
|-------------|-------|
| Resolusi spasial | 30 meter |
| Resolusi temporal | 16 hari per satelit (8 hari dengan L8+L9) |
| Band untuk NDVI | SR_B5 (NIR), SR_B4 (Red) |
| Band untuk NBR | SR_B5 (NIR), SR_B7 (SWIR2) |
| Skala reflektansi | Kalibrasi USGA: DN * 0.0000275 - 0.2 |
| Cloud masking | QA_PIXEL (bitwise mask bit 0-4) |

*Justifikasi:* Landsat Collection 2 Level-2 adalah standar internasional untuk analisis tutupan lahan. Data sudah terkoreksi atmosferik, sehingga indeks vegetasi dapat langsung dihitung tanpa koreksi tambahan. Bitwise QA_PIXEL dipilih karena lebih akurat membedakan awan, bayangan, dan dilasi awan dibandingkan pendekatan berbasis threshold suhu.

**Sentinel-2 MSI Harmonized Level-2A** (`COPERNICUS/S2_SR_HARMONIZED`)

| Spesifikasi | Nilai |
|-------------|-------|
| Resolusi spasial | 10 meter (diregrid ke 30m saat fusion) |
| Resolusi temporal | 5 hari |
| Band untuk NDVI | B8 (NIR), B4 (Red) |
| Band untuk NBR | B8 (NIR), B12 (SWIR2) |
| Skala reflektansi | ESA: DN / 10000 |
| Cloud masking | SCL (Scene Classification Layer) |

*Justifikasi:* Sentinel-2 memberikan frekuensi revisit lebih tinggi (5 hari) dibanding Landsat, yang penting di daerah tropis awan seperti Jambi. Data harmonized memastikan konsistensi spektral antar misi. SCL dipilih karena menggunakan klasifikasi berbasis AI yang mampu mendeteksi bayangan awan (cloud shadows) lebih baik dari QA60. Penggunaan SCL sangat penting untuk menghindari kontaminasi kabut asap dan bayangan awan di komposit tahunan.

### 3.2 Data Titik Api

**MODIS MOD14A1** (`MODIS/061/MOD14A1`)

Deteksi kebakaran aktif harian pada resolusi 1 km, menggunakan kanal termal 4 mikrometer dan 11 mikrometer. Ambang batas FireMask >= 7 digunakan untuk memastikan hanya piksel dengan tingkat kepercayaan deteksi tinggi yang dihitung.

**FIRMS (VIIRS)** (`FIRMS`)

Deteksi kebakaran aktif VIIRS 375 meter dari satelit Suomi-NPP dan NOAA-20. Menggunakan kanal T21 untuk deteksi anomali termal.

*Justifikasi:* Penggabungan MODIS dan VIIRS memberikan cakupan temporal yang lebih rapat dan memanfaatkan kelebihan masing-masing sensor (cakupan luas MODIS + resolusi lebih halus VIIRS). Kedua sumber dijumlahkan per piksel untuk menghasilkan peta frekuensi hotspot (bukan sekadar kehadiran).

### 3.3 Data Validasi & Pembanding

**Hansen Global Forest Change v1.13 (2025)** (`UMD/hansen/global_forest_change_2025_v1_13`)

- Band `lossyear`: tahun deteksi kehilangan tutupan pohon (1-25 = 2001-2025)
- Rentang validasi: lossyear 20-24 (tahun 2020-2024)
- Digunakan untuk memvalidasi peta deforestasi NDVI-based

*Justifikasi:* Dataset Hansen adalah satu-satunya produk global konsisten yang memetakan perubahan tutupan pohon tahunan dari 2001 hingga sekarang. Band lossyear digunakan sebagai referensi independen untuk mengukur akurasi deteksi deforestasi berbasis NDVI.

**MODIS MCD64A1 Burned Area** (`MODIS/061/MCD64A1`)

- Resolusi 500 meter
- Band `BurnDate`: tanggal julian terbakarnya suatu piksel
- Digunakan untuk cross-check luas area terbakar hasil dNBR

*Justifikasi:* MCD64A1 adalah produk standar NASA untuk pemetaan area terbakar global. Meski resolusinya lebih kasar (500m), data ini menjadi acuan validasi yang diakui secara ilmiah.

---

## 4. Tahap 1: Data Acquisition & Preprocessing

### 4.1 Cloud Masking

Tujuan: Menghilangkan piksel awan, bayangan awan, dan kabut dari citra satelit sebelum pembentukan komposit.

**Landsat 8/9:** Algoritma bitwise pada band QA_PIXEL

```
Bit 0: Fill
Bit 1: Dilated Cloud
Bit 2: Cirrus
Bit 3: Cloud
Bit 4: Cloud Shadow

Mask = bitwiseAnd(11111, 2) == 0 → piksel bersih
```

**Sentinel-2:** Algoritma Scene Classification Layer (SCL)

| Nilai SCL | Kelas | Tindakan |
|-----------|-------|----------|
| 3 | Cloud shadow | Dibuang |
| 8 | Cloud medium probability | Dibuang |
| 9 | Cloud high probability | Dibuang |
| 10 | Thin cirrus | Dibuang |

*Justifikasi:* SCL dipilih menggantikan QA60 karena:
- QA60 hanya mendeteksi awan opaque (bit 10) dan cirrus (bit 11), tetapi tidak mendeteksi **bayangan awan** dan **kabut asap**,
- Pada kejadian El Nino 2023, kabut asap dan bayangan awan dari kebakaran Sumatra mengontaminasi komposit Sentinel-2, menyebabkan nilai NDVI anjlok palsu,
- SCL menggunakan algoritma klasifikasi yang mampu mengidentifikasi bayangan awan langsung (nilai 3).

### 4.2 Annual Median Composite

Setiap tahun (1 Januari - 31 Desember):

1. Filter koleksi Landsat 8, Landsat 9, dan Sentinel-2 berdasarkan tanggal dan ROI
2. Terapkan cloud masking pada masing-masing citra
3. Sampling band yang diperlukan (Blue, Green, Red, NIR, SWIR2)
4. Hitung indeks NDVI dan NBR per citra
5. Merge ketiga koleksi menjadi satu
6. Ambil **nilai median** dari seluruh citra per piksel
7. Clip ke batas Provinsi Jambi

*Justifikasi:* Median lebih robust dibanding mean (rata-rata) karena tidak terpengaruh outlier seperti sisa awan tipis. Dengan 2000+ citra Landsat dan ribuan citra Sentinel-2 per tahun di area Jambi, median memberikan estimasi reflektansi permukaan yang stabil.

---

## 5. Tahap 2: Forest Cover Change & Deforestation Detection

### 5.1 Perhitungan NDVI

Formula: `NDVI = (NIR - Red) / (NIR + Red)`

| Sensor | NIR | Red |
|--------|-----|-----|
| Landsat 8/9 | SR_B5 | SR_B4 |
| Sentinel-2 (renamed) | SR_B5 | SR_B4 |

Implementasi GEE: `image.normalizedDifference(['SR_B5', 'SR_B4'])`

### 5.2 Deteksi Deforestasi (Year t vs Year t+1)

Deforestasi dideteksi dengan membandingkan NDVI antar tahun berurutan:

`dNDVI = NDVI(t) − NDVI(t+1)`

Jika `dNDVI > 0.2`, piksel diklasifikasikan sebagai deforestasi.

**Filter vegetasi awal:** Hanya piksel dengan `NDVI(t) > 0.3` yang dianalisis. Ini mencegah false positive di area non-vegetasi (sungai, lahan terbuka, pemukiman).

*Justifikasi:* Ambang 0.2 dipilih berdasarkan studi literatur deforestasi tropis. Penurunan NDVI > 0.2 secara konsisten menandakan hilangnya tutupan pohon akibat tebang habis atau kebakaran berat. Filter NDVI > 0.3 memastikan area yang "dideforestasi" memang sebelumnya memiliki vegetasi.

### 5.3 Integrasi & Validasi Hansen GFW

Dataset Hansen GFW band `lossyear` memberikan informasi tahun kehilangan tutupan pohon. Untuk transisi tahun t ke t+1:

```
lossyear = t − 1999
```

Contoh: Deforestasi 2020-2021 divalidasi dengan lossyear = 21 (kehilangan terdeteksi di 2021).

**Metrik validasi:**

| Metrik | Rumus | Deskripsi |
|--------|-------|-----------|
| Area deforestasi NDVI | Σ(NDVI_def * pixelArea / 10000) | Hektar dari deteksi NDVI |
| Area loss GFW | Σ(GFW_loss * pixelArea / 10000) | Hektar dari Hansen GFW |
| Overlap | Σ(NDVI_def AND GFW_loss * pixelArea / 10000) | Hektar yang terdeteksi kedua metode |

---

## 6. Tahap 3: Fire Occurrence & Burn Severity

### 6.1 Analisis Kepadatan Hotspot (Fire Occurrence)

**MODIS MOD14A1:** Filter `FireMask >= 7` (confidence tinggi), binary per citra
**FIRMS VIIRS:** Filter `T21 > 0` (deteksi anomali termal), binary per citra

Keduanya dijumlahkan per piksel untuk menghasilkan **peta frekuensi hotspot** (berapa kali terdeteksi api dalam setahun). Tidak menggunakan operasi `.gt(0)` agar nilai frekuensi asli tetap terjaga.

*Justifikasi:* Data MODIS dan VIIRS dikombinasikan untuk memaksimalkan cakupan temporal. MOD14A1 lebih sensitif di area non-vegetasi, sementara VIIRS 375m lebih detail. Penjumlahan frekuensi (bukan kehadiran) memungkinkan diferensiasi area dengan pembakaran berulang.

### 6.2 Normalized Burn Ratio (NBR)

Formula: `NBR = (NIR − SWIR2) / (NIR + SWIR2)`

| Sensor | NIR | SWIR2 |
|--------|-----|-------|
| Landsat 8/9 | SR_B5 | SR_B7 |
| Sentinel-2 (renamed) | SR_B5 | SR_B7 |

Implementasi GEE: `image.normalizedDifference(['SR_B5', 'SR_B7'])`

*Justifikasi:* NBR lebih sensitif terhadap perubahan akibat api dibanding NDVI karena kanal SWIR2 sangat responsif terhadap hilangnya kandungan air dan klorofil pada vegetasi terbakar.

### 6.3 dNBR & Klasifikasi Tingkat Keparahan (USGS Standard)

`dNBR = NBR(t) − NBR(t+1)`

| Nilai dNBR | Kelas Severity | Kode |
|------------|----------------|:----:|
| < 0.1 | Unburned / Regrowth | 0 |
| 0.1 — 0.27 | Low Severity | 1 |
| 0.27 — 0.44 | Moderate-Low Severity | 2 |
| 0.44 — 0.66 | Moderate-High Severity | 3 |
| ≥ 0.66 | High Severity | 4 |

*Justifikasi:* Threshold ini mengikuti standar USGS yang digunakan secara global untuk pemetaan burn severity. Penggunaan threshold bertingkat memungkinkan analisis diferensiasi dampak kebakaran: dari semak terbakar ringan hingga kanopi hutan hangus total.

### 6.4 Cross-check MODIS MCD64A1

Untuk setiap transisi tahun, area terbakar moderate+ (severity ≥ 2) dibandingkan dengan data MODIS MCD64A1:

- Area dNBR (moderate+)
- Area MCD64A1 (BurnedDate > 0)
- Overlap (deteksi concurrence antara dNBR dan MCD64A1)

*Justifikasi:* MCD64A1 memberikan acuan independen yang sudah divalidasi NASA. Perbedaan antara dNBR dan MCD64A1 menunjukkan keterbatasan masing-masing metode — dNBR lebih sensitif (mendeteksi perubahan sekecil apapun) sementara MCD64A1 lebih spesifik terhadap api sebenarnya (menggunakan algoritma multi-temporal).

---

## 7. Hasil Verifikasi & Catatan Eksperimen

### 7.1 NDVI Time-series

| Tahun | NDVI Mean | NDVI Min | NDVI Max | Keterangan |
|:-----:|:---------:|:--------:|:--------:|------------|
| 2020 | 0.668 | -0.358 | 0.873 | Normal La-Nina (basah) |
| 2021 | 0.679 | -0.310 | 0.865 | Stabil |
| 2022 | 0.749 | -0.384 | 0.887 | Meningkat (recovery) |
| 2023 | 0.697 | -0.440 | 0.862 | Normal (dengan SCL fix) |
| 2024 | 0.705 | -0.307 | 0.864 | Normal |

Setelah SCL fix, NDVI 2022-2023 tidak lagi anjlok, menunjukkan bahwa kontaminasi bayangan awan dan kabut asap El Nino 2023 sudah berhasil dieliminasi.

### 7.2 Kendala & Solusi

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| NDVI 2022-2023 anjlok palsu | QA60 tidak deteksi cloud shadow & smoke | Ganti ke SCL (Scene Classification Layer) |
| FeatureCollection kosong | reduceRegion didalam list.map | Gunakan ImageCollection.map |
| dNBR high severity tidak muncul | Threshold 1.3 (salah) | Kembali ke threshold USGS 0.66 |
| Tipe data tidak kompatibel | Landsat & S2 range berbeda | updateMask sebelum scaling + toFloat |
| Export CSV tidak berisi | Collection kosong akibat bug di atas | Semua di atas diperbaiki |

---

## 8. Output & Format Data

| Output | Format | Jumlah | Resolusi |
|--------|--------|:------:|:--------:|
| Komposit tahunan | GeoTIFF (Asset GEE) | 5 file | 30m |
| Peta deforestasi NDVI | GeoTIFF (Asset GEE) | 4 file | 30m |
| Peta dNBR + burn severity | GeoTIFF (Asset GEE) | 4 file | 30m |
| Peta hotspot density | GeoTIFF (Asset GEE) | 5 file | 375m |
| Tabel validasi deforestasi vs GFW | CSV (Google Drive) | 1 file | — |
| Tabel validasi dNBR vs MCD64A1 | CSV (Google Drive) | 1 file | — |

---

## 9. Referensi

- Hansen, M. C. et al. (2013). High-Resolution Global Maps of 21st-Century Forest Cover Change. *Science*, 342(6160), 850-853.
- USGS (2019). Landsat Collection 2 Level-2 Science Product Guide.
- European Space Agency (2021). Sentinel-2 Level-2A Product Specification.
- Giglio, L. et al. (2018). The Collection 6 MODIS burned area mapping algorithm. *Remote Sensing of Environment*, 217, 72-85.
- USGS & NPS (2003). FIREMON: Fire Effects Monitoring and Inventory System. dNBR thresholds for burn severity classification.

---

*Dokumen ini dibuat pada 9 Juli 2026, menyertai script GEE `step1-3-compact.js`.*
