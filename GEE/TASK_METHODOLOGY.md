### TAHAP 1: Pengumpulan & Pra-pemrosesan Data (*Data Acquisition & Preprocessing*)

Tahapan ini difokuskan pada penyiapan data satelit multiresolusi untuk menghasilkan citra dasar yang konsisten secara temporal dan bebas dari anomali atmosfer.

* **Sensor Fusion:** Melakukan akuisisi dan integrasi citra satelit optik dari Landsat 8/9 dan Sentinel-2 untuk mengoptimalkan ketersediaan piksel yang valid.
* **Cloud & Shadow Masking:** Mengeliminasi gangguan atmosferik seperti awan dan bayangan awan menggunakan algoritma berbasis *Scene Classification Layer* (SCL) pada Sentinel-2 dan bit *QA_PIXEL* pada Landsat.
* **Temporal Compositing:** Menyusun komposit citra tahunan menggunakan metode *median reducer* untuk mendapatkan representasi piksel permukaan bumi yang paling stabil pada setiap periode observasi.

### TAHAP 2: Pemetaan & Validasi Deforestasi (*Deforestation Mapping*)

Tahapan ini bertujuan untuk mengidentifikasi area yang mengalami kehilangan tutupan tajuk pohon secara kuantitatif.

* **Kalkulasi Indeks Vegetasi:** Menerapkan metode *NDVI differencing* untuk menghitung selisih nilai kehijauan vegetasi antar tahun. Penurunan nilai yang melewati ambang batas (*threshold*) yang telah ditetapkan diklasifikasikan sebagai area terdeforestasi.
* **Validasi Spasial Eksternal:** Melakukan tumpang susun (*spatial overlay*) antara luasan deforestasi hasil ekstraksi NDVI dengan dataset referensi *Global Forest Watch* (GFW) untuk mengukur tingkat irisan luasan secara komparatif.

### TAHAP 3: Pemetaan Titik Api & Keparahan Bakar (*Fire Occurrence & Burn Severity*)

Tahapan ini memetakan eksistensi panas aktif dan dampak kerusakan termal pada permukaan tanah.

* **Pemetaan Anomali Termal:** Mengumpulkan dan mengagregasi data *hotspot* harian dari sensor termal MODIS dan VIIRS untuk membentuk peta sebaran dan densitas titik api tahunan.
* **Kalkulasi Keparahan Bakar:** Menghitung indeks *differenced Normalized Burn Ratio* (dNBR) guna mengekstraksi area yang memiliki jejak luka bakar.
* **Uji Silang Area Terbakar:** Membandingkan peta dNBR beresolusi menengah (30m) dengan dataset area terbakar global MODIS MCD64A1 (500m) untuk menganalisis disparitas sensitivitas deteksi.

### TAHAP 4: Analisis Hubungan Spasial (*Spatial Relationship Analysis*)

Tahapan ini merupakan proses integrasi spasial untuk mengklasifikasikan tipologi pembukaan lahan berdasarkan indikator lingkungan yang telah diekstraksi.

* **Analisis Jarak Kedekatan (Buffer Analysis):** Membangun area *buffer* dengan radius spesifik (1000 meter) mengelilingi setiap koordinat *hotspot* aktif untuk mengakomodasi toleransi galat geolokasi sensor termal.
* **Klasifikasi Berbasis Aturan (Rule-based Classification):** Menerapkan logika tumpang susun (*overlay*) pada area deforestasi. Area yang berhimpitan secara spasial dengan tingkat keparahan dNBR tinggi atau berada di dalam *buffer hotspot* diklasifikasikan sebagai pembukaan lahan terkait api (*Burning Clearing*). Sebaliknya, area deforestasi tanpa anomali termal maupun jejak dNBR diklasifikasikan sebagai pembukaan lahan non-api (*Mechanical Clearing*).

### TAHAP 5: Analisis Terintegrasi & Validasi Lapangan (*Integrated Analysis & UAV Validation*)

Tahapan ini mendalami metrik kuantitatif dan merancang protokol validasi kebenaran lapangan (*ground truth*).

* **Ekstraksi Metrik Temporal:** Menghitung luasan dan persentase transisi tipe pembukaan lahan (*clearing type*) dari tahun ke tahun untuk menyusun tren spasio-temporal.
* **Penentuan Titik Sampel UAV:** Memanfaatkan poligon klasifikasi spasial dari Tahap 4 untuk menentukan *Region of Interest* (ROI) yang paling representatif. Area irisan (defotasi dan luka bakar) dijadikan target prioritas untuk survei validasi menggunakan fotogrametri udara dari *Unmanned Aerial Vehicle* (UAV/Drone).

---

### OUTPUT / DELIVERABLES (Keluaran Penelitian)

Bagian akhir dari kerangka metodologi ini akan menghasilkan luaran penelitian berupa:

1. **Peta Tematik Spasio-Temporal:** Visualisasi kartografi yang memetakan distribusi lokasi deforestasi beserta klasifikasi metode pembukaan lahannya di wilayah studi.
2. **Dataset Kuantitatif:** Tabulasi metrik spasial yang mencakup luas area deforestasi, luas area terbakar, persentase validasi silang antar sensor, dan rasio transisi tipe tutupan lahan.
3. **Analisis Evaluasi Kebijakan:** Landasan data empiris dan geospasial yang dapat diinterpretasikan lebih lanjut untuk mengevaluasi efektivitas pemantauan lahan dan menyokong kebijakan terkait mitigasi perubahan lingkungan.
