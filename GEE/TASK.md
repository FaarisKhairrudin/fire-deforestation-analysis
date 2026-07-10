# Rencana Pelaksanaan Analisis Spasio-Temporal GEE (Tahap 1-4)

## Wilayah Studi: Provinsi Jambi (2020-2024)

 Dokumen ini memuat panduan arsitektur logika dan metodologi detail untuk mengimplementasikan analisis akuisisi data, deteksi perubahan tutupan hutan, penilaian kebakaran, hingga analisis hubungan spasial di Google Earth Engine (GEE). Panduan ini disusun untuk mengoptimalkan performa skrip dan menghindari kendala memori (*computation timed out / memory exceeded*).

### 1. PERSIAPAN AWAL & SETUP LINGKUNGAN GEE

Sebelum memproses data satelit, parameter dasar lingkungan harus didefinisikan dengan tepat:

* **Region of Interest (ROI):** Batas administrasi Provinsi Jambi didapatkan melalui filter dataset `FAO/GAUL/2015/level1` atau menggunakan aset Shapefile khusus yang diunggah ke GEE Asset.
* **Time of Interest (TOI):** Rentang waktu dari 1 Januari 2020 sampai 31 Desember 2024.
* **Strategi Pengolahan:** Mengingat besarnya cakupan wilayah Jambi dan durasi analisis (5 tahun), pengolahan wajib menggunakan pendekatan iteratif tahunan menggunakan list objek `ee.List.sequence(2020, 2024)` untuk memetakan fungsi (*mapping functions*) secara berkala.

---

### 2. TAHAP 1: DATA ACQUISITION & PREPROCESSING

Tujuan dari tahap ini adalah menghasilkan citra komposit tahunan yang bersih dari gangguan awan dan bayangan awan untuk analisis lanjutan.

#### A. Pemilihan Dataset di GEE

* **Citra Optik Utama (Resolusi Menengah):** * Landsat 8 & 9 Surface Reflectance: `LANDSAT/LC08/C02/T1_L2` dan `LANDSAT/LC09/C02/T1_L2`
  * Sentinel-2 Level-2A: `COPERNICUS/S2_SR_HARMONIZED`
* **Data Titik Api (Hotspot):**
  * VIIRS & MODIS Active Fire melalui dataset FIRMS: `FIRMS`
  * MODIS Active Fire Produk Standar: `MODIS/061/MOD14A1`
* **Data Validasi & Pembanding Luasan:**
  * MODIS Burned Area: `MODIS/061/MCD64A1`
  * Global Forest Watch (Hansen Global Forest Change): `UMD/hansen/global_forest_change_2023_v1_11`
    
    #### B. Algoritma Preprocessing Routine
1. **Cloud Masking:** * Untuk Landsat 8/9, gunakan *band* `QA_PIXEL` dengan operasi bitwise untuk menyaring awan, bayangan awan, dan dilasi awan.
   * Untuk Sentinel-2, gunakan *band* `QA60` atau pendekatan berbasis probabilitas awan (`COPERNICUS/S2_CLOUD_PROBABILITY`) guna meminimalkan sisa awan tipis.
2. **Temporal Compositing:** * Grup koleksi gambar disaring berdasarkan rentang waktu per tahun dan wilayah Jambi.
   * Lakukan reduksi menggunakan nilai median (`.median()`) untuk menghilangkan piksel ekstrem akibat sisa awan atau anomali sensor.
3. **Mosaicking & Clipping:** * Gabungkan seluruh potongan citra (*mosaic*) dan potong sesuai batas wilayah administrasi menggunakan fungsi `.clip(jambi_roi)`.
4. **Reprojection & Scale:**
   * Biarkan komputasi berjalan pada proyeksi bawaan masing-masing sensor sepanjang proses dan tentukan CRS (misalnya EPSG:32648 untuk UTM 48N) beserta resolusi spasial (10m atau 30m) secara eksplisit hanya saat melakukan ekspor data atau reduksi region.

---

### 3. TAHAP 2: FOREST COVER CHANGE & DEFORESTATION DETECTION

Tahap ini berfokus pada pelacakan area penurunan kerapatan vegetasi dan penentuan area deforestasi tahunan.

#### A. Perhitungan Indeks Vegetasi (NDVI)

* Formulasi indeks: 
    $$NDVI = rac{NIR - Red}{NIR + Red}$$
* Pada skrip GEE, terapkan fungsi `.normalizedDifference(['B8', 'B4'])` untuk Sentinel-2 atau `(['SR_B5', 'SR_B4'])` untuk Landsat 8/9. Band indeks ini ditambahkan ke masing-masing komposit tahunan sebagai *band* baru.
  
  #### B. Deteksi Perubahan Menggunakan Metode Selisih Tahun (Year t vs Year t+1)
1. Bandingkan NDVI tahun berjalan ($t$) dengan tahun berikutnya ($t+1$).
2. Tentukan nilai ambang batas (*threshold*) penurunan nilai NDVI yang mengindikasikan hilangnya tutupan pohon (misalnya, penurunan $\Delta NDVI > 0.2$ tergantung pada karakteristik kanopi lokal).
3. Piksel yang memenuhi kriteria tersebut diklasifikasikan menjadi peta biner deforestasi tahunan (*Annual Deforestation Map*).
   
   #### C. Integrasi dan Validasi Data Global Forest Watch (GFW)
* Panggil dataset Hansen GFC.
* Gunakan *band* `lossyear` dan lakukan masking piksel yang bernilai antara 20 sampai 24 (merepresentasikan hilangnya hutan dari tahun 2020 hingga 2024).
* Gunakan layer biner GFW ini untuk menyaring (*masking*) atau memvalidasi tingkat akurasi spasial dari peta deforestasi berbasis NDVI yang telah dibuat secara mandiri.

---

### 4. TAHAP 3: FIRE OCCURRENCE & BURN SEVERITY ASSESSMENT

Tahap ini mengidentifikasi keberadaan api permukaan serta mengukur dampak kerusakan fisik akibat kebakaran pada vegetasi.

#### A. Analisis Kejadian Api (Fire Occurrence)

* Saring koleksi data FIRMS atau MODIS Active Fire untuk area Jambi pada jendela waktu tahunan.
* Konversikan data titik api menjadi representasi densitas spasial menggunakan teknik kernel density atau agregasi ke dalam grid spasial tertentu untuk melihat frekuensi kemunculan *hotspot* per wilayah.
  
  #### B. Perhitungan Tingkat Keparahan Kebakaran (Burn Severity - dNBR)
1. Hitung *Normalized Burn Ratio* (NBR) untuk kondisi sebelum kebakaran (*pre-fire*) dan setelah kebakaran (*post-fire*) memanfaatkan komposit tahunan:
   $$NBR = rac{NIR - SWIR}{NIR + SWIR}$$
2. Hitung selisih atau delta NBR (dNBR):
   $$dNBR = NBR_{pre} - NBR_{post}$$
3. **Klasifikasi Tingkat Kerusakan:** Lakukan pengelompokan nilai dNBR berdasarkan standar USGS menggunakan fungsi logika berantai di GEE (`.where()` atau `ee.Image.expression`):
   * Unburned (Tidak Terbakar)
   * Low Severity (Tingkat Keparahan Rendah)
   * Moderate Severity (Tingkat Keparahan Sedang)
   * High Severity (Tingkat Keparahan Tinggi)
   * Very High Severity (Tingkat Keparahan Sangat Tinggi)
4. Lakukan *cross-checking* hasil luas total dNBR kelas menengah hingga tinggi dengan dataset MODIS Burned Area (`MCD64A1`) sebagai pembanding validitas makro.

---

### 5. TAHAP 4: SPATIAL RELATIONSHIP ANALYSIS

Bagian ini menghubungkan keluaran dari Tahap 2 dan Tahap 3 secara spasio-temporal untuk memahami pola pembukaan lahan di Provinsi Jambi.

#### A. Operasi Overlay Spasial & Perhitungan Metrik

* **Persentase Deforestasi Akibat Titik Api (% Forest Loss with Hotspot):** Buat area penyangga (*buffer*) di sekitar titik *hotspot* tahunan. Lakukan irisan (*intersect*) spasial antara area *deforestation* dengan area *buffer hotspot*. Hitung total luas piksel hasil irisan menggunakan `ee.Image.pixelArea()` dan `reduceRegion(ee.Reducer.sum())`.
* **Persentase Deforestasi Terbakar Nyata (% Forest Loss with Burn):** Lakukan tumpang-susun antara layer deforestasi tahunan dengan peta dNBR kelas tingkat keparahan sedang hingga sangat tinggi. Hitung berapa proporsi area hutan yang hilang yang berhimpitan langsung dengan bekas kebakaran fisik.
* **Buffer Analysis (Distance to Fire):** Buat visualisasi jarak kontinu dari setiap titik api menggunakan fungsi `ee.Image.distance()`. Analisis jarak spasial area deforestasi baru terhadap titik api terdekat guna memahami apakah pola deforestasi merambat dari area terbakar.
  
  #### B. Ekstraksi Tren dan Statistik Spasio-Temporal
* Gabungkan seluruh luasan hasil perhitungan tahunan (Deforestasi total, Deforestasi terkait api, Luas area terbakar dNBR) ke dalam format struktur data `ee.FeatureCollection`.
* Ekspor tabel data terstruktur ini ke dalam format CSV menggunakan perintah `Export.table.toDrive()` untuk pengolahan grafik eksternal atau gunakan pustaka grafik internal GEE jika proses dijalankan langsung pada Code Editor. Hasil tabel ini menjadi landasan analisis peralihan metode pembukaan lahan dari pembakaran tradisional menuju pembersihan mekanis.

---

### KELUARAN UTAMA DARI TAHAP 1-4

1. **Koleksi Peta Raster Tahunan:** Peta deforestasi tahunan, kerapatan titik api, dan tingkat keparahan kebakaran (dNBR) terklasifikasi untuk Provinsi Jambi.
2. **Tabel Statistik Tren:** Data deret waktu (time-series) dalam format CSV berisi metrik luasan konversi lahan dan keterkaitannya dengan aktivitas kebakaran hutan.
3. **Dasar Konteks Validasi Lapangan:** Peta komposit spasial gabungan ini akan menjadi acuan utama untuk menentukan titik koordinat sampling terbang drone pada **Tahap 5 (Field Verification)**.
