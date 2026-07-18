# Metodologi Analisis Spasio-Temporal Deforestasi & Kebakaran Hutan

**Wilayah Studi:** Provinsi Jambi, Indonesia  
**Periode:** 2016–2025  
**Platform:** Google Earth Engine (GEE)

---

## 1. Data yang Digunakan

| Data | Sumber (GEE Collection ID) | Resolusi Spasial | Periode | Penggunaan |
|---|---|---|---|---|
| Landsat 8/9 OLI Level-2 | `LANDSAT/LC08/C02/T1_L2`<br>`LANDSAT/LC09/C02/T1_L2` | 30 m | 2016–2025 | Komposit tahunan (RGB, NDVI, NBR) |
| Sentinel-2 MSI Level-2A | `COPERNICUS/S2_SR_HARMONIZED` | 20 m → 30 m | **2022–2025** | Komposit tahunan (NDVI, NBR) |
| MODIS MOD14A1 | `MODIS/061/MOD14A1` | 1000 m | 2016–2025 | Deteksi titik api (hotspot) |
| MODIS MCD64A1 | `MODIS/061/MCD64A1` | 500 m | 2016–2025 | Validasi luas area terbakar |
| Hansen Global Forest Change | `UMD/hansen/global_forest_change_2025_v1_13` | 30 m | 2016–2025 | Validasi deforestasi (GFW) |
| FAO GAUL 2015 | `FAO/GAUL/2015/level1` | — | — | Batas administrasi Provinsi Jambi |

---

## 2. Preprocessing Citra

### 2.1 Landsat 8/9 (Collection 2, Tier 1, Level-2)

1. **Cloud masking (QA_PIXEL):** Bitmask `QA_PIXEL` digunakan untuk membuang piksel yang terklasifikasi sebagai *fill*, awan, bayangan awan, dan cirrus. Piksel dipertahankan hanya jika 5 bit pertama bernilai nol (`bitwiseAnd(0b11111) == 0`).

2. **Rescaling:** Nilai DN (Digital Number) diskalakan ke reflektansi permukaan (*surface reflectance*) menggunakan koefisien standar Collection 2:
   ```
   reflectance = DN × 0.0000275 − 0.2
   ```

3. **Blue Band Gating:** Reflektansi band biru (`SR_B2`) di-threshold pada **0.20**. Piksel dengan `SR_B2 ≥ 0.20` dibuang. Teknik ini efektif menghilangkan sisa asap, kabut tipis, dan tepi awan yang lolos dari QA_PIXEL, khususnya di wilayah tropis dengan tutupan awan tinggi.

### 2.2 Sentinel-2 MSI (Level-2A, Harmonized)

Sentinel-2 hanya digunakan **mulai tahun 2022 ke atas**. European Space Agency (ESA) secara bertahap memperbarui algoritma Sen2Cor yang menghasilkan layer *Scene Classification* (SCL). Peningkatan signifikan terjadi pada **Processing Baseline 04.00** (Januari 2022) yang memperbaiki akurasi klasifikasi awan, bayangan awan, dan cirrus di wilayah tropis. Data L2A pada periode 2017–2018 juga tidak memiliki cakupan global yang lengkap di GEE.

1. **SCL whitelist (super ketat):** Hanya piksel yang terklasifikasi sebagai **Vegetasi (4)** atau **Bare Soil (5)** oleh SCL yang dipertahankan. Semua kelas lain — termasuk bayangan awan (3), dark area (2), air (6), awan rendah/sedang/tinggi (7–9), dan cirrus (10) — dibuang.

2. **Rescaling & harmonisasi band:** Sentinel-2 L2A menyimpan reflektansi dalam skala 10000. Band di-rescale (`DN / 10000`) dan di-rename agar sesuai dengan penamaan Landsat:
   | Sentinel-2 | Landsat |
   |---|---|
   | B2 (Blue) | SR_B2 |
   | B3 (Green) | SR_B3 |
   | B4 (Red) | SR_B4 |
   | B8 (NIR) | SR_B5 |
   | B12 (SWIR1) | SR_B7 |

3. **Blue Band Gating:** Sama dengan Landsat — `SR_B2 < 0.20` untuk membersihkan tepi awan residual dan kabut tipis.

---

## 3. Tahap 1: Komposit Citra Tahunan

### 3.1 Strategi Hybrid Sensor

Komposit tahunan dibangun dengan pendekatan sensor hibrida:

| Periode | Sensor Digunakan |
|---|---|
| 2016–2021 | Landsat 8/9 saja |
| 2022–2025 | Landsat 8/9 + Sentinel-2 |

Untuk setiap tahun, seluruh citra yang lolos preprocessing digabung dan dihitung **median**-nya, menghasilkan satu citra komposit tahunan dengan band: `SR_B2, SR_B3, SR_B4, SR_B5, SR_B7, NDVI, NBR`.

### 3.2 Indeks Spektral

| Indeks | Rumus | Band | Fungsi |
|---|---|---|---|
| NDVI | (NIR − Red) / (NIR + Red) | NIR=SR_B5, Red=SR_B4 | Deteksi kesehatan vegetasi |
| NBR | (NIR − SWIR1) / (NIR + SWIR1) | NIR=SR_B5, SWIR1=SR_B7 | Deteksi area terbakar |

---

## 4. Tahap 2: Pemetaan Deforestasi

### 4.1 Deteksi Perubahan NDVI

Deforestasi dideteksi melalui penurunan NDVI antar dua tahun berturut-turut:

```
Deforestasi(t→t+1) = NDVI(t) − NDVI(t+1) > 0.2
```

dengan syarat awal: `NDVI(t) > 0.3` (memastikan piksel merupakan area bervegetasi pada tahun awal).

### 4.2 Validasi dengan Hansen Global Forest Change

Hasil deforestasi berbasis NDVI divalidasi secara spasial dengan data Hansen *Global Forest Change* (GFW). Piksel *loss* GFW pada tahun *t+1* (lossyear = t − 1999) di-overlay dengan peta deforestasi NDVI untuk menghitung:
- Luas deforestasi GFW
- Luas deforestasi NDVI
- Luas *overlap* (kesepakatan spasial kedua metode)

---

## 5. Tahap 3: Kejadian Api dan Tingkat Keparahan Terbakar

### 5.1 Deteksi Titik Api (Hotspot)

- **Sumber:** MODIS MOD14A1 — produk anomali termal harian pada resolusi 1000 m
- **Threshold:** Piksel dengan `FireMask ≥ 7` (mencakup *low confidence*, *nominal confidence*, dan *high confidence* fire)
- **Agregasi tahunan:** Seluruh deteksi dalam satu tahun dijumlahkan per piksel → *hotspot density*
- **Binary detection:** Keluaran akhir adalah peta biner `hotspot.gt(0)` — piksel 1 km yang terdeteksi api minimal satu kali dalam setahun
- **Jumlah hotspot:** Dihitung sebagai jumlah piksel 1 km yang terdeteksi api, konsisten dengan analisis binary di Tahap 4

### 5.2 Tingkat Keparahan Terbakar (Burn Severity — dNBR)

- **Rumus:** `dNBR = NBR(t) − NBR(t+1)` — selisih NBR sebelum dan sesudah
- **Klasifikasi USGS:** Nilai dNBR diklasifikasikan berdasarkan standar *United States Geological Survey*:

| dNBR Range | Kelas Severity | Kode |
|---|---|---|
| < 0.1 | Unburned / Enhanced | 0 |
| 0.10 – 0.27 | Low Severity | 1 |
| 0.27 – 0.44 | Moderate Severity | 2 |
| 0.44 – 0.66 | Moderate-High Severity | 3 |
| > 0.66 | High Severity | 4 |

- **Threshold operasional:** Severity **≥ 2** (Moderate ke atas) digunakan sebagai batas minimum area yang dianggap terbakar
- **Validasi:** Dibandingkan dengan produk *burned area* MODIS MCD64A1 (resolusi 500 m) melalui overlay spasial

---

## 6. Tahap 4: Analisis Hubungan Spasial

### 6.1 Buffer Hotspot

Peta biner hotspot di-buffer sejauh **1000 m** menggunakan `focal_max`:

```
hotspotBuffer = hotspot.gt(0).focal_max({ radius: 1000, units: 'meters' })
```

Fungsi buffer menutupi *offset* spasial antara resolusi deteksi MODIS (1000 m) dengan resolusi citra komposit (30 m). Setiap piksel 30 m dalam radius 1 km dari titik deteksi MODIS ditandai sebagai area yang terpengaruh aktivitas api.

### 6.2 Klasifikasi Tipe Pembukaan Lahan (AND Logic)

Metode **AND logic** digunakan untuk mengklasifikasikan deforestasi menjadi dua tipe:

```
Burning Clearing   = Deforestasi ∩ (Burn Severity ≥ 2) ∩ (Hotspot Buffer 1km)
Mechanical Clearing = Deforestasi ∩ ¬[(Burn Severity ≥ 2) ∩ (Hotspot Buffer 1km)]
```

| Tipe | Simbol | Artinya |
|---|---|---|
| Burning Clearing (1) | 🔴 | Pembukaan lahan dengan bukti api (burn severity + hotspot) |
| Mechanical Clearing (2) | 🟠 | Pembukaan lahan tanpa bukti api (alat berat, herbisida, dll.) |

Pendekatan **AND** dipilih karena mensyaratkan kehadiran **kedua bukti** (dNBR ≥ moderate **dan** hotspot dalam 1 km), sehingga mengurangi *false positive* dari tanah terbuka (*bare soil*) setelah *mechanical clearing* yang dapat menghasilkan sinyal dNBR menyerupai area terbakar.

### 6.3 Spatial Coupling Metrics

Dua metrik tambahan dihitung untuk mengukur keterkaitan spasial antara deforestasi, hotspot, dan *burn severity*:

| Metrik | Rumus | Makna |
|---|---|---|
| **% Deforestasi dalam Hotspot** | `Area_Defor_in_Hotspot / Area_Total_Defor × 100` | Proporsi deforestasi yang berada dalam radius 1 km dari deteksi api |
| **% Deforestasi dengan Burn** | `Area_Defor_with_Burn / Area_Total_Defor × 100` | Proporsi deforestasi yang tumpang tindih dengan area terbakar moderate+ |

Perubahan kedua metrik ini dari waktu ke waktu menggambarkan **dinamika *spatial coupling*** antara aktivitas pembukaan lahan dan penggunaan api.

---

## 7. Output dan Ekspor

### 7.1 CSV Statistik (Google Drive)

| File | Kolom Utama | Tahap |
|---|---|---|
| `Task_Stats_Deforestasi_Drive.csv` | GFW_Loss, NDVI_Defor, Overlap | Tahap 2 — Validasi Deforestasi |
| `Task_Stats_Burn_Drive.csv` | dNBR_Area, MCD64_Area, Burn_Overlap | Tahap 3 — Validasi Burn |
| `Task_Stats_Hotspot_Count.csv` | hotspot_count | Tahap 3 — Jumlah hotspot per tahun |
| `Tahap4_Clearing_Transition_Stats.csv` | Area_Burning_ha, Area_Mechanical_ha, Area_Defor_in_Hotspot_ha, Area_Defor_with_Burn_ha | Tahap 4 — Spatial coupling |

### 7.2 Raster Assets (GEE)

| Asset | Isi | Penggunaan |
|---|---|---|
| `Deforestasi_YYYY` | Peta deforestasi biner | Input Tahap 4 |
| `BurnSeverity_YYYY` | Peta severity (1–4) + dNBR | Input Tahap 4 |
| `Hotspot_YYYY` | Peta densitas hotspot tahunan | Input Tahap 4 |

### 7.3 Peta GeoTIFF (Google Drive)

| File | Isi |
|---|---|
| `Tahap4_ClearingType_Map_YYYY` | Peta klasifikasi tipe pembukaan lahan (1=Mechanical, 2=Burning) |

---

## 8. Ringkasan Alur Analisis

```
Landsat 8/9 + Sentinel-2 (2022+)
        │
        ▼
   Preprocessing (QA masking + SCL whitelist + Blue Band Gating)
        │
        ▼
   Komposit Tahunan (median per tahun)
        │
        ├──────────────────────────────┐
        ▼                              ▼
   ΔNDVI (Deforestasi)           dNBR (Burn Severity)
        │                              │
        ▼                              ▼
   Validasi GFW Hansen          Validasi MCD64A1
        │                              │
        ├──────────┬───────────────────┘
        ▼          ▼
   Hotspot MOD14A1 (FireMask ≥ 7)
        │
        ▼
   Buffer 1km → AND Logic → Klasifikasi Burning/Mechanical
        │
        ▼
   Spatial Coupling Metrics
```
