# Penjelasan Lengkap Analisis Spasio-Temporal GEE — Provinsi Jambi (2020–2025)

## Daftar Isi

1. [Gambaran Umum Penelitian](#1-gambaran-umum-penelitian)
2. [Tahap 1: Data Acquisition & Preprocessing](#2-tahap-1-data-acquisition--preprocessing)
3. [Tahap 2: Deforestation Mapping & GFW Validation](#3-tahap-2-deforestation-mapping--gfw-validation)
4. [Tahap 3: Fire Occurrence & Burn Severity](#4-tahap-3-fire-occurrence--burn-severity)
5. [Tahap 4: Spatial Relationship Analysis](#5-tahap-4-spatial-relationship-analysis)
6. [Ringkasan Hasil](#6-ringkasan-hasil)
7. [Panduan File Kode](#7-panduan-file-kode)
8. [Catatan Teknis & Bug Fix](#8-catatan-teknis--bug-fix)

---

## 1. Gambaran Umum Penelitian

### Tujuan

Menganalisis hubungan spasio-temporal antara **deforestasi** (hilangnya tutupan hutan) dan **kebakaran hutan/lahan** di Provinsi Jambi, Indonesia, pada periode 2020–2025. Penelitian ini menjawab pertanyaan:

> *"Apakah deforestasi di Jambi disebabkan oleh pembakaran lahan (slash-and-burn) atau pembersihan mekanis (alat berat)?"*

### Alur Kerja

```
Data Satelit Multi-Sensor
        │
        ▼
  ┌─────────────────┐
  │  TAHAP 1        │  Penggabungan sensor, cloud masking, komposit tahunan
  │  Preprocessing  │  Landsat 8/9 + Sentinel-2 → citra tahunan bersih
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  TAHAP 2        │  NDVI differencing → peta deforestasi tahunan
  │  Deforestation  │  Validasi dengan Hansen Global Forest Watch (GFW)
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  TAHAP 3        │  Hotspot MODIS/VIIRS + dNBR (burn severity)
  │  Fire Analysis  │  Validasi dengan MODIS MCD64A1
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  TAHAP 4        │  Overlay spasial deforestasi × api
  │  Spatial        │  Klasifikasi: Mechanical vs Burning Clearing
  │  Relationship   │  Ekstraksi metrik dan visualisasi
  └─────────────────┘
```

### Wilayah Studi

Provinsi Jambi, Sumatra, Indonesia — area dengan deforestasi tinggi untuk perkebunan kelapa sawit dan HTI, serta rawan kebakaran lahan gambut.

### Dataset yang Digunakan

| Dataset | Sumber | Resolusi | Fungsi |
|---------|--------|----------|--------|
| Landsat 8/9 OLI Surface Reflectance | NASA/USGS | 30m | Komposit optik tahunan |
| Sentinel-2 MSI Surface Reflectance | ESA | 10-20m | Komposit optik tahunan |
| Hansen Global Forest Change v1.13 | UMD | 30m | Validasi deforestasi eksternal |
| MODIS MOD14A1 | NASA | 1km | Titik api aktif |
| FIRMS (VIIRS + MODIS) | NASA | 375m | Titik api aktif |
| MODIS MCD64A1 | NASA | 500m | Validasi area terbakar eksternal |
| FAO GAUL 2015 | FAO | - | Batas administrasi provinsi |

---

## 2. Tahap 1: Data Acquisition & Preprocessing

### 2.1. Konsep Dasar

Tujuan: menghasilkan **satu citra komposit per tahun** yang bersih dari awan, bayangan awan, dan noise atmosfer, dengan memanfaatkan tiga sensor optik berbeda secara simultan.

### 2.2. Sensor Fusion — Mengapa Tiga Sensor?

| Sensor | Kelebihan | Kelemahan |
|--------|-----------|-----------|
| Landsat 8 | Data historis panjang, kalibrasi stabil | Resolusi temporal 16 hari |
| Landsat 9 | Sama dengan L8, sebagai backup | Diluncurkan 2021 |
| Sentinel-2 | Resolusi temporal 5 hari, 10m (lebih detail) | Mulai operasi 2017 |

**Logika Fusion:** Ketiga sensor digabung (merged) sebelum direduksi median. Dengan menggabungkan scene dari tiga sensor, jumlah piksel valid per tahun meningkat drastis — sangat penting di daerah tropis seperti Jambi yang sering tertutup awan.

### 2.3. Cloud Masking

Setiap sensor punya metode masking berbeda:

#### Landsat 8/9 — QA_PIXEL

```
QA_PIXEL (bit 0-4):
  Bit 0: Fill          (1 = nodata)
  Bit 1: Dilated Cloud (1 = terpengaruh awan)
  Bit 2: Cirrus        (1 = awan tipis)
  Bit 3: Cloud         (1 = awan tebal)
  Bit 4: Cloud Shadow  (1 = bayangan awan)

Mask: bitwiseAnd('11111') == 0
     → Semua bit 0-4 harus = 0 (piksel bersih)
```

Kode: `img.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0)`

#### Sentinel-2 — SCL (Scene Classification Layer)

```
SCL Nilai  Kelas
    3      Cloud Shadow      → Mask
    8      Cloud Medium Prob → Mask
    9      Cloud High Prob   → Mask
   10      Thin Cirrus       → Mask
   Lain    Clear / Veg / Soil → Simpan
```

Kode: `scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10))`

### 2.4. Scaling Reflectance

Nilai digital mentah dari satelit perlu diskalakan ke *Surface Reflectance* aktual:

| Sensor | Formula Scaling |
|--------|-----------------|
| Landsat 8/9 C02 L2 | `SR * 0.0000275 - 0.2` |
| Sentinel-2 SR | `SR / 10000` |

### 2.5. Band Harmonization

Agar ketiga sensor bisa dianalisis bersama, band-band Sentinel-2 di-rename agar sesuai dengan nama band Landsat:

| Fungsi | Landsat | Sentinel-2 → rename |
|--------|---------|---------------------|
| Blue | SR_B2 | B2 → SR_B2 |
| Green | SR_B3 | B3 → SR_B3 |
| Red | SR_B4 | B4 → SR_B4 |
| NIR | SR_B5 | B8 → SR_B5 |
| SWIR2 | SR_B7 | B12 → SR_B7 |

### 2.6. Komposit Tahunan (Median Reducer)

```javascript
l8Col.merge(l9Col).merge(s2Col).median().clip(jambiROI)
```

**Kenapa median?** Median lebih robust terhadap outlier dibanding mean. Jika satu scene masih menyisakan sedikit awan tipis, median akan memilih nilai tipikal (piksel tanah) bukan nilai ekstrem (awan cerah).

### 2.7. Indeks Vegetasi dan Bakar

Dua indeks kunci dihitung dan ditambahkan ke setiap komposit:

**NDVI (Normalized Difference Vegetation Index):**
```
NDVI = (NIR - Red) / (NIR + Red)
     = (B5 - B4) / (B5 + B4)
```
- Rentang: -1 sampai +1
- Vegetasi lebat: 0.6–0.9
- Tanah terbuka: 0.1–0.3
- Air: < 0

**NBR (Normalized Burn Ratio):**
```
NBR = (NIR - SWIR2) / (NIR + SWIR2)
    = (B5 - B7) / (B5 + B7)
```
- Vegetasi sehat: NIR tinggi, SWIR2 rendah → NBR tinggi
- Area terbakar: NIR rendah (abu serap NIR), SWIR2 tinggi → NBR rendah

---

## 3. Tahap 2: Deforestation Mapping & GFW Validation

### 3.1. Konsep Dasar

Mendeteksi area yang kehilangan vegetasi dengan membandingkan NDVI antar tahun.

### 3.2. NDVI Differencing

```javascript
var defor = ndviT.subtract(ndviT1).gt(0.2)
              .updateMask(ndviT.gt(0.3));
```

**Logika:**
1. `ndviT - ndviT+1` = selisih NDVI tahun T ke T+1
2. Jika selisih > 0.2 → penurunan signifikan → deforestasi
3. `updateMask(ndviT.gt(0.3))` → hanya area yang sebelumnya bervegetasi (NDVI > 0.3)

**Kenapa threshold 0.2?** Berdasarkan karakteristik kanopi tropis Jambi. Penurunan NDVI sebesar 0.2 setara dengan hilangnya tutupan tajuk pohon secara signifikan. Nilai ini bisa dikalibrasi ulang jika hasil observasi lapangan menunjukkan threshold yang lebih tepat.

**Kenapa mask ndviT > 0.3?** Untuk menghindari false positive di area yang memang sudah tidak bervegetasi (lahan terbuka, pemukiman, air). Hanya area yang "hijau" di tahun T yang bisa "dideforestasi" di tahun T+1.

### 3.3. Validasi dengan Hansen GFW

**Apa itu GFW?** Global Forest Watch (Hansen) adalah dataset global yang mendeteksi *stand-replacement disturbance* — hilangnya tutupan kanopi pohon berkayu keras. Data ini dihasilkan dari analisis time-series Landsat.

**Lossyear Encoding:**
```
lossyear = 0    → tidak ada kehilangan hutan
lossyear = N    → kehilangan terdeteksi di tahun (2000 + N)
                → tahun 2020 = lossyear 20
                → tahun 2021 = lossyear 21
```

**Validasi Spasial — Cara Kerja:**
```
Overlap = area yang terdeteksi SEBAGAI deforestasi 
          oleh NDVI differencing DAN oleh GFW
```

NDVI differencing membandingkan komposit T (keadaan "sebelum") dengan komposit T+1 (keadaan "sesudah"). Hansen lossyear mencatat tahun kehilangan hutan terdeteksi. Untuk transisi T → T+1, lossyear yang sesuai adalah **T+1**, karena Hansen mendeteksi hutan hilang di tahun yang sama saat NDVI differencing melihat perubahan:

```javascript
// y = tahun awal transisi (T). Untuk transisi 2020→2021, y=2020.
// y-1999 = 21 → lossyear 21 → kehilangan tahun 2021
gfwLoss = hansenGFC.select('lossyear').eq(y.subtract(1999));
```

<!--
CATATAN: lossyear = T+1 (y-1999), BUKAN T (y-2000).
Alasan: NDVI differencing mengukur perubahan dari komposit T ke T+1.
Kalau hutan sudah hilang di tahun T, komposit T sudah menunjukkan NDVI rendah,
sehingga selisih NDVI T→T+1 jadi kecil dan tidak terdeteksi sebagai deforestasi.
-->

### 3.4. Interpretasi Hasil Validasi

| Metrik | Arti |
|--------|------|
| NDVI_Defor (ha) | Deforestasi terdeteksi metode NDVI |
| GFW_Loss (ha) | Deforestasi terdeteksi Hansen GFW |
| Overlap (ha) | Irisan keduanya — area yang pasti deforestasi |
| Overlap (%) | Tingkat kesesuaian antar metode |

**Mengapa overlap tidak 100%?** Kedua metode punya definisi ekologis berbeda:
- **GFW** mendeteksi hilangnya *pohon berkayu keras* (stand-replacement)
- **NDVI differencing** lebih sensitif — tangkap juga pembukaan semak belukar, agroforestri, dan lahan gambut terbuka

Keduanya **saling melengkapi** (komplementer), bukan substitusi.

### 3.5. Hasil Deforestasi Jambi 2020–2025

| Tahun Transisi | GFW (ha) | NDVI (ha) | Overlap (ha) | Overlap (%) |
|---------------|----------|-----------|-------------|-------------|
| 2020–2021 | 77.206 | 65.358 | 10.263 | 13,3% |
| 2021–2022 | 79.486 | 26.126 | 4.778 | 6,0% |
| 2022–2023 | 102.789 | 103.376 | 19.550 | 19,0% |
| 2023–2024 | 99.063 | 78.642 | 13.574 | 13,7% |
| 2024–2025 | 79.933 | 48.631 | 8.023 | 10,0% |
| **Total** | **438.475** | **322.132** | **56.188** | **12,8%** |

**Temuan:**
- Puncak deforestasi: **2022–2023** (fase El Niño, musim kemarau panjang)
- Drop NDVI 2021–2022: **La Niña** — tutupan awan ekstrem → SCL masking agresif → banyak piksel valid hilang → underestimasi

---

## 4. Tahap 3: Fire Occurrence & Burn Severity

### 4.1. Konsep Dasar

Memetakan dua aspek kebakaran: (1) titik api aktif saat kebakaran berlangsung (hotspot) dan (2) bekas luka bakar setelah api padam (burn scar).

### 4.2. Hotspot — Deteksi Api Aktif

Dua sumber data termal digabung:

#### MODIS MOD14A1

| FireMask | Kelas | Digunakan? |
|----------|-------|------------|
| 0–2 | Not processed / Water / Cloud | Tidak |
| 3–5 | Low confidence | Tidak (false positive tinggi) |
| 6 | Medium confidence | Tidak |
| **7** | **Nominal confidence** | **Ya — ambang bawah** |
| 8–9 | High confidence | Ya |

**Kenapa ≥ 7?** Threshold konservatif untuk meminimalkan false positive. Di Jambi, kabut asap dan aerosol dari kebakaran lahan gambut sering mengganggu deteksi MODIS.

#### VIIRS (FIRMS)

FIRMS adalah produk gabungan MODIS + VIIRS yang sudah melewati algoritma deteksi resmi NASA. Nilai `T21 > 0` memisahkan piksel api dari *fill value* (0 = nodata). Ini aman karena FIRMS sendiri sudah melakukan pre-filtering.

#### Densitas Tahunan

```javascript
return modisActive.add(viirsActive).rename('hotspot_count');
```

Nilai akhir bukan binary (ada/tidak ada) melainkan **jumlah deteksi** per piksel per tahun. Jika satu piksel terdeteksi api 10 kali dalam setahun, nilainya 10. Ini memberikan informasi **intensitas** kebakaran.

### 4.3. dNBR — Deteksi Bekas Luka Bakar

#### Konsep Fisik

```
dNBR = NBR_pre-fire - NBR_post-fire
```

| Kondisi | NIR | SWIR2 | NBR | dNBR |
|---------|-----|-------|-----|------|
| Vegetasi sehat | Tinggi (0,4) | Rendah (0,1) | 0,6 | - |
| Area terbakar | Rendah (0,1) | Tinggi (0,3) | -0,5 | **1,1** |
| Tidak berubah | - | - | - | ~0 |

**dNBR positif besar** → vegetasi hilang → bekas bakar.

#### Klasifikasi Severity (Standar USGS)

| dNBR | Kelas | Kelas di Kode | Makna Ekologis |
|------|-------|---------------|----------------|
| < 0,10 | Unburned | 0 | Tidak terbakar |
| 0,10 – 0,26 | Low | 1 | Semak/lantai hutan terbakar; kanopi hidup |
| 0,27 – 0,43 | Moderate-Low | 1 | (Digabung low di visualisasi) |
| 0,44 – 0,65 | Moderate-High | 2 | Kanopi dominan terbakar |
| 0,66 – 0,99 | High | 3 | Defoliasi total |
| > 1,00 | Very High | 4 | Pembakaran sempurna |

Di Tahap 4, `severity ≥ 2` (Moderate ke atas) dipakai sebagai indikator "benar-benar terbakar".

### 4.4. Validasi dengan MCD64A1

MCD64A1 adalah produk area terbakar global MODIS (resolusi 500m). Validasi ini untuk menguji seberapa besar perbedaan deteksi antara:

| Metode | Resolusi | Prinsip Deteksi |
|--------|----------|-----------------|
| dNBR (kita) | 30m | Multi-spektral optik (NIR + SWIR) |
| MCD64A1 | 500m | Multi-temporal + perubahan reflektansi |

### 4.5. Hasil Burn Analysis Jambi

| Tahun Transisi | dNBR Area (ha) | MCD64A1 (ha) | Rasio |
|---------------|----------------|-------------|-------|
| 2020–2021 | 38.789 | 695 | 55,8× |
| 2021–2022 | 24.288 | 794 | 30,6× |
| 2022–2023 | 61.692 | 3.993 | 15,4× |
| 2023–2024 | 68.903 | 7.444 | 9,3× |
| 2024–2025 | 37.936 | 4.468 | 8,5× |
| **Total** | **231.607** | **17.394** | **13,3×** |

**Temuan Kunci:** dNBR mendeteksi 13 kali lipat lebih luas dari MCD64A1. Ini karena:
1. MCD64A1 resolusi 500m → gabungkan area kecil jadi satu piksel campuran
2. Kebakaran di Jambi berskala kecil dan sporadis (*smallholder fires*) → tidak terdeteksi MODIS
3. dNBR (30m) dari fusi Landsat+S2 mampu tangkap luka bakar kecil dengan presisi tinggi

---

## 5. Tahap 4: Spatial Relationship Analysis

### 5.1. Konsep Dasar

**Integrasi** peta deforestasi (Tahap 2) dengan peta kebakaran (Tahap 3) untuk mengklasifikasikan **metode pembukaan lahan**.

### 5.2. Rule-Based Classification

```
                    ┌─────────────────────┐
                    │   Deforestasi (NDVI) │
                    │      (binary mask)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Berhimpitan       │
                    │   dengan api?       │
                    │                     │
          ┌─────────┤  isBurned =         ├──────────┐
          │         │  dNBR ≥ 2 OR        │          │
          │         │  dalam hotspot      │          │
          │         │  buffer 1km         │          │
          │         └─────────────────────┘          │
          ▼                                         ▼
  ┌─────────────────┐                     ┌─────────────────┐
  │ Burning Clearing │                     │Mechanical       │
  │ (Kelas 2)       │                     │Clearing (Kelas1)│
  │ Deforestasi     │                     │ Deforestasi     │
  │ DENGAN api      │                     │ TANPA api       │
  └─────────────────┘                     └─────────────────┘
```

### 5.3. Buffer Hotspot 1000m

```javascript
var hotspotBuffer = hotspot.gt(0).focal_max({
    radius: 1000, units: 'meters'
});
```

**Kenapa buffer?** Sensor termal (MODIS 1km, VIIRS 375m) punya galat geolokasi hingga ratusan meter. Buffer 1km mengakomodasi:
1. Galat posisi koordinat hotspot
2. Perambatan api ke area sekitar titik deteksi
3. Piksel campuran di tepi api

### 5.4. Logika isBurned

```javascript
var isBurned = burn.gte(2).or(hotspotBuffer.eq(1));
```

**OR** — area dianggap "terkait api" jika **salah satu** dari dua indikator terpenuhi:

| Skenario | dNBR ≥ 2 | Hotspot dalam 1km | isBurned |
|----------|----------|-------------------|----------|
| Api besar, bekas jelas | ✅ | ✅ | true |
| Api kecil, terlewat MODIS | ✅ | ❌ | true (dNBR rescue) |
| Tertutup asap, optik gagal | ❌ | ✅ | true (hotspot rescue) |
| Tidak ada api | ❌ | ❌ | false |

### 5.5. Metrik yang Diekstrak

| Metrik | Rumus | Satuan |
|--------|-------|--------|
| Total Deforestasi | `clearing.gt(0) × pixelArea / 10000` | Ha |
| Mechanical Clearing | `clearing.eq(1) × pixelArea / 10000` | Ha |
| Burning Clearing | `clearing.eq(2) × pixelArea / 10000` | Ha |

### 5.6. Visualisasi di Map GEE

Layer yang ditampilkan per tahun (dari bawah ke atas):
1. **RGB Satelit** — Landsat natural color sebagai bukti visual
2. **Deforestasi** — putih, menunjukkan area yang hilang
3. **Hotspot Buffer** — ungu transparan, radius 1km
4. **Burn Severity** — orange-merah (kelas moderate-very high)
5. **★ Clearing Type** — kuning (mechanical) / merah (burning)

Tahun 2023 aktif secara default karena merupakan puncak deforestasi.

---

## 6. Ringkasan Hasil

### Statistik Utama

| Metrik | Nilai |
|--------|-------|
| Total Deforestasi (GFW) | 438.475 Ha |
| Total Deforestasi (NDVI) | 322.132 Ha |
| Overlap GFW ∩ NDVI | 56.188 Ha (12,8%) |
| Total Area Terbakar (dNBR) | 231.607 Ha |
| Total Area Terbakar (MCD64A1) | 17.394 Ha |
| Deforestasi Terkait Api | ~2.234 Ha (0,51%) |
| Puncak Deforestasi | 2022–2023 (El Niño) |
| Puncak Kebakaran | 2023–2024 |

### Kesimpulan Penelitian

1. **Dominasi Pembersihan Mekanis:** <1% deforestasi terkait api → pembukaan lahan di Jambi didominasi alat berat, bukan slash-and-burn. Ini sejalan dengan meningkatnya penegakan hukum Karhutla.

2. **Keunggulan Resolusi Spasial:** dNBR fusi (30m) mendeteksi 13× lipat area terbakar dibanding MCD64A1 (500m). Sensor resolusi menengah sangat penting untuk memetakan kebakaran sporadis di tropis.

3. **Komplementaritas Data:** GFW dan NDVI saling melengkapi. GFW optimal untuk hutan primer; NDVI menangkap transisi agroforestri sekunder.

4. **Titik Validasi UAV (Tahap 5):** Prioritas terbang drone pada:
   - Area irisan GFW ∩ NDVI (cross-validated deforestation)
   - Poligon Burn Overlap (deforestasi + api) untuk verifikasi arang/abu

---

## 7. Panduan File Kode

| File | Fungsi |
|------|--------|
| [`code/step1-3-compact.js`](code/step1-3-compact.js) | **Tahap 1–3 dalam satu skrip**: preprocessing, komposit tahunan, deforestasi NDVI, validasi GFW, hotspot, dNBR, validasi MCD64A1, ekspor aset raster dan tabel CSV |
| [`code/step-4.js`](code/step-4.js) | **Tahap 4**: Loading aset dari step 1-3, buffer analysis, klasifikasi clearing type, visualisasi interaktif, ekspor tabel metrik dan peta final |
| [`data/Task_Stats_Deforestasi_Drive.csv`](data/Task_Stats_Deforestasi_Drive.csv) | Hasil tabel deforestasi (GFW, NDVI, Overlap) per tahun transisi |
| [`data/Task_Stats_Burn_Drive.csv`](data/Task_Stats_Burn_Drive.csv) | Hasil tabel kebakaran (dNBR, MCD64, Burn Overlap) per tahun transisi |
| [`analysis_visualization.ipynb`](analysis_visualization.ipynb) | Notebook Python untuk visualisasi dan analisis lanjutan dari CSV |
| [`documentation/resutls.md`](documentation/resutls.md) | Dokumentasi hasil dan interpretasi |
| [`TASK_METHODOLOGY.md`](TASK_METHODOLOGY.md) | Metodologi penelitian |
| [`TASK.md`](TASK.md) | Panduan implementasi teknis GEE |

### Catatan Penggunaan

**Untuk menjalankan di GEE Code Editor:**
1. Buka `code/step1-3-compact.js` — jalankan untuk membuat komposit, peta deforestasi, hotspot, dan burn severity. Ekspor raster ke Assets dan tabel ke Google Drive.
2. Setelah Assets tersedia, buka `code/step-4.js` — jalankan untuk overlay spasial dan klasifikasi clearing type.
3. Download CSV dari Drive, letakkan di `data/` untuk analisis notebook.

---

## 8. Catatan Teknis & Bug Fix

### Bug yang Telah Diperbaiki

1. **Lossyear Hansen GFW (step1-3-compact.js baris 99):**
   - Sebelum: `hansenGFC.select('lossyear').eq(y.subtract(1999))` — hanya menangkap lossyear tahun T+1
   - Sesudah: menangkap lossyear tahun T **DAN** T+1 sesuai transisi
   - Dampak: overlap GFW-NDVI kemungkinan lebih tinggi dari 12,8% setelah re-run

2. **Duplikasi kode (step-4.js baris 165-329):**
   - Blok kode duplikat dihapus untuk mencegah task ganda dan layer duplikat

### Keterbatasan Metodologi

1. **Cloud cover:** Tahun La Niña (2021–2022) menghasilkan underestimasi NDVI karena SCL masking yang agresif
2. **No SAR data:** Sentinel-1 (radar) bisa tembus awan tetapi belum diintegrasikan
3. **Single threshold:** NDVI threshold 0,2 bersifat tetap. Nilai optimal bisa bervariasi per tipe tutupan lahan
4. **Resolusi hotspot:** Buffer 1km adalah aproksimasi; hotspot bisa berada di luar radius akibat galat geolokasi

---
*Dokumen ini dibuat untuk mendukung analisis spasio-temporal deforestasi dan kebakaran hutan di Provinsi Jambi menggunakan Google Earth Engine.*
