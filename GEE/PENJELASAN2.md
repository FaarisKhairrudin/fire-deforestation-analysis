

# METODOLOGI PENELITIAN

## 3.1 Wilayah Studi & Platform Komputasi

Penelitian ini difokuskan di Provinsi Jambi, Indonesia, dalam rentang periode observasi tahun 2020 hingga 2025. Seluruh pemrosesan data spasio-temporal berskala besar dieksekusi berbasis *cloud computing* menggunakan platform Google Earth Engine (GEE). Alur kerja dibagi menjadi empat tahapan analitik utama, mulai dari pra-pemrosesan citra multispektral hingga pengujian hubungan spasial untuk mengklasifikasikan tipologi pembukaan lahan.

---

## 3.2 Tahap 1: Akuisisi Data, Fusi Sensor, & Pra-pemrosesan Citra

Tahap pertama bertujuan untuk membangun komposit citra tahunan yang bebas dari gangguan atmosferik (awan, bayangan awan, dan kabut asap) serta menyelaraskan (*harmonization*) perbedaan karakteristik antar-sensor satelit.

### A. Deskripsi Dataset

Penelitian ini mengintegrasikan lima dataset utama yang disediakan dalam katalog GEE:

1. **Landsat 8 OLI & Landsat 9 OLI-2 (Collection 2 Level-2):** Citra optik multispektral beresolusi spasial 30 meter yang telah terkoreksi radiometrik menjadi *Surface Reflectance* (SR).
2. **Sentinel-2 MSI (*Harmonized Surface Reflectance*):** Citra optik beresolusi tinggi (10–20 meter) dari European Space Agency (ESA) yang telah dinormalisasi terhadap pergeseran radiometrik pasca-pengenalan *baseline* 04.00.
3. **MODIS MOD14A1 & VIIRS FIRMS:** Dataset anomali termal (*active fire / hotspot*) harian beresolusi 1 km (MODIS) dan 375 meter (VIIRS) untuk mendeteksi keberadaan titik api aktif.
4. **Global Forest Watch (Hansen GFC v1.13):** Dataset global kehilangan tutupan hutan (*tree cover loss*) beresolusi 30 meter sebagai data validasi deforestasi.
5. **MODIS MCD64A1:** Dataset global area terbakar (*burned area*) beresolusi 500 meter sebagai data validasi silang kebakaran hutan.

### B. Harmonisasi & Normalisasi Sensor Optik

Untuk menggabungkan Landsat dan Sentinel-2 ke dalam satu koleksi waktu yang kontinyu, dilakukan harmonisasi nama dan skala pita spektral (*spectral bands*). Gelombang *Blue, Green, Red, Near-Infrared* (NIR), dan *Shortwave-Infrared 2* (SWIR-2) pada Sentinel-2 (Pita B2, B3, B4, B8, B12) diselaraskan penamaannya agar setara dengan pita Landsat (`SR_B2` hingga `SR_B7`). Skala reflektansi Landsat dikalibrasi menggunakan koefisien resmi USGS ($0.0000275 \times \text{nilai} - 0.2$), sementara Sentinel-2 dibagi dengan faktor $10.000$.

### C. Evolusi Pra-pemrosesan: Optimalisasi Masking Sentinel-2 (SCL vs QA60)

Pada tahap awal pra-pemrosesan, penutupan awan pada Sentinel-2 menggunakan pita bitmask `QA60`. Namun, evaluasi spasial menunjukkan adanya anomali *false positive* (deteksi deforestasi palsu) yang masif pada tahun transisi 2021–2022. Hal ini disebabkan oleh fenomena La Niña (curah hujan tinggi) dan El Niño (kabut asap) di mana algoritma `QA60` terbukti **gagal mengenali bayangan awan pekat (*cloud shadows*) dan asap tipis**, sehingga nilai reflektansi citra turun drastis dan disalahartikan oleh sistem sebagai hilangnya vegetasi.

Untuk mengatasi kelemahan kritis tersebut, protokol pra-pemrosesan **direkonstruksi menggunakan pita *Scene Classification Layer* (SCL)** berbasis kecerdasan buatan dari ESA. Logika pemfilteran diperketat dengan membuang piksel yang terklasifikasi sebagai:

* `SCL = 3`: Bayangan awan (*Cloud shadows*)
* `SCL = 8`: Awan probabilitas sedang (*Cloud medium probability*)
* `SCL = 9`: Awan probabilitas tinggi (*Cloud high probability*)
* `SCL = 10`: Awan sirus tipis (*Thin cirrus*)

Sementara pada Landsat, penapisan dilakukan menggunakan bitmask `QA_PIXEL` dengan mengeliminasi bit 0 hingga 4 (*fill, dilated cloud, cirrus, cloud, cloud shadow*).

### D. Ekstraksi Indeks Spektral & Komposit Tahunan

Setelah citra bersih dari gangguan atmosfer, dihitung dua indeks vegetasi utama pada setiap piksel:

1. **NDVI (*Normalized Difference Vegetation Index*):** Mengukur tingkat kehijauan dan kerapatan kanopi vegetasi.

$$\text{NDVI} = \frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}}$$


2. **NBR (*Normalized Difference Burn Ratio*):** Mengukur kadar air vegetasi dan jejak arang/abu untuk deteksi luka bakar.

$$\text{NBR} = \frac{\text{NIR} - \text{SWIR2}}{\text{NIR} + \text{SWIR2}}$$



Seluruh citra bersih yang melintasi Provinsi Jambi dalam rentang 1 Januari hingga 31 Desember diagregasi menjadi **Komposit Median Tahunan (*Yearly Median Composite*)**. Metode median dipilih karena kebal terhadap *outlier* ekstrem, menghasilkan satu citra representatif per tahun dari 2020 hingga 2025.

---

## 3.3 Tahap 2: Pemetaan Deforestasi & Validasi Spasial

Tahap kedua bertujuan untuk mengidentifikasi lokasi dan luasan area yang mengalami kehilangan tutupan hutan secara matematis antar-tahun.

### A. Ekstraksi Deforestasi Berbasis NDVI Differencing

Deteksi pembukaan lahan dilakukan dengan menghitung selisih nilai kehijauan vegetasi antar dua komposit tahunan berurutan ($\Delta\text{NDVI} = \text{NDVI}_{T} - \text{NDVI}_{T+1}$). Piksel diklasifikasikan sebagai area terdeforestasi apabila memenuhi dua syarat kumulatif:

1. Mengalami penurunan nilai NDVI melewati ambang batas sensitivitas ($\Delta\text{NDVI} > 0.2$).
2. Pada tahun awal observasi ($T$), piksel tersebut terverifikasi sebagai vegetasi rapat ($\text{NDVI}_{T} > 0.3$). Syarat kedua ini merupakan *vegetation masking* krusial untuk mencegah area perkotaan, badan air, atau lahan terbuka terhitung sebagai deforestasi.

### B. Validasi Spasial & Ekstraksi Luasan

Peta deforestasi berbasis NDVI kemudian diuji keselarasan spasialnya (*spatial overlap*) dengan dataset referensi *Global Forest Watch* (Hansen GFC `lossyear`). Untuk mengakomodasi sifat komposit tahunan yang merangkum kejadian selama 12 bulan, validasi diselaraskan dengan parameter waktu tebang Hansen pada tahun transisi $T+1$. Luasan area deforestasi murni, luasan GFW, serta irisan tumpang susun kedua metode dihitung dalam satuan Hektar menggunakan fungsi `reduceRegion` berbasis luas piksel absolut (`ee.Image.pixelArea`).

---

## 3.4 Tahap 3: Pemetaan Titik Api & Tingkat Keparahan Bakar (*Burn Severity*)

Tahap ketiga berfokus pada pelacakan bukti fisik api yang menyala dan mengukur dampak kerusakan termal pada permukaan tanah.

### A. Agregasi Densitas Titik Api (*Active Fire / Hotspot*)

Data titik panas dari sensor MODIS (`FireMask` $\ge 7$, tingkat kepercayaan nominal hingga tinggi) dan VIIRS (`T21` $> 0$) digabungkan. Berbeda dengan pendekatan biner biasa, titik api diakumulasikan sepanjang tahun menggunakan fungsi `.sum()`. Hasilnya adalah peta densitas titik api tahunan (*hotspot count*) yang menunjukkan intensitas dan frekuensi pembakaran di suatu koordinat.

### B. Kalkulasi dNBR & Klasifikasi Keparahan Bakar

Kerusakan vegetasi akibat api diukur menggunakan metode *differenced Normalized Burn Ratio* ($\Delta\text{NBR} = \text{NBR}_{T} - \text{NBR}_{T+1}$). Nilai dNBR yang positif mengindikasikan hilangnya vegetasi sehat dan munculnya material karbon/arang pasca-kebakaran.

Nilai dNBR diklasifikasikan ke dalam lima tingkat keparahan standar *United States Geological Survey* (USGS) menggunakan fungsi berantai (`.where()`):

* **Unburned / Very Low:** $\Delta\text{NBR} < 0.1$ (Kelas 0)
* **Low Severity:** $0.1 \le \Delta\text{NBR} < 0.27$ (Kelas 1)
* **Moderate Severity:** $0.27 \le \Delta\text{NBR} < 0.44$ (Kelas 2)
* **Moderate-High Severity:** $0.44 \le \Delta\text{NBR} < 0.66$ (Kelas 3)
* **High Severity:** $\Delta\text{NBR} \ge 0.66$ (Kelas 4)

Peta keparahan bakar tingkat sedang hingga tinggi (Kelas $\ge 2$) kemudian divalidasi secara spasial dengan produk area terbakar global NASA MODIS MCD64A1 untuk membandingkan performa deteksi resolusi tinggi (30m) terhadap sensor resolusi kasar (500m).

---

## 3.5 Tahap 4: Analisis Hubungan Spasial & Tipologi Pembukaan Lahan

Tahap keempat merupakan inti sintesis analitik untuk menjawab hipotesis penelitian: **Apakah deforestasi yang terjadi didorong oleh metode pembakaran (*burning*) atau pembersihan mekanis (*mechanical*)?**

### A. Analisis Zona Penyangga Termal (*Hotspot Buffer Analysis*)

Sensor termal satelit memiliki toleransi kesalahan geolokasi (*geolocation error*) dan sering kali terhalang oleh asap tebal saat kebakaran berlangsung. Untuk memastikan tidak ada jejak api yang terlewat, dibangun zona penyangga (*spatial buffer*) sejauh **1.000 meter (1 km)** mengelilingi setiap koordinat titik api aktif menggunakan operator morfologi spasial `focal_max`.

### B. Logika Klasifikasi Tipologi Pembukaan Lahan

Tiga layer raster yang telah dihasilkan—yaitu Peta Deforestasi (Tahap 2), Peta Keparahan Bakar (Tahap 3), dan Peta Buffer Hotspot (Tahap 4A)—ditumpang-susunkan (*spatial overlay*) secara kondisional di dalam batas Area Deforestasi ($\text{Defor} = 1$). Logika klasifikasi dibagi menjadi dua kelas aturan (*Rule-based Classification*):

1. **Pembukaan Lahan dengan Api (*Burning Clearing* — Kelas 2):**
Diberikan pada piksel deforestasi yang memiliki jejak luka bakar tingkat sedang hingga tinggi ($\text{dNBR} \ge 2$) **ATAU** berada di dalam radius zona penyangga titik api aktif ($\text{Hotspot Buffer} = 1$). Logika ini menangkap lahan yang sengaja dibakar, baik yang meninggalkan jejak arang pekat maupun yang apinya tertangkap oleh satelit termal saat kejadian.
2. **Pembukaan Lahan Mekanis (*Mechanical Clearing* — Kelas 1):**
Diberikan pada piksel deforestasi yang **SAMA SEKALI TIDAK** memiliki jejak luka bakar ($\text{dNBR} < 2$) **DAN TIDAK** berada di dekat rekaman titik api satelit. Kelas ini merepresentasikan pembersihan lahan menggunakan alat berat (ekskavator), gergaji mesin, atau pembukaan manual tanpa pembakaran.

Seluruh peta raster tipologi pembukaan lahan ini diekspor ke dalam GEE Assets untuk kebutuhan pemetaan visual, sementara metrik statistik luasannya diakumulasikan per tahun transisi dan diekspor dalam format tabular (CSV) ke Google Drive untuk analisis tren lanjutan.
