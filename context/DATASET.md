# Papper Source

"./papper/Aerial imagery pile burn detection using deep learningThe FLAME dataset.pdf"

## 1. Konteks dan Lokasi Pengambilan Data

- **Objek Observasi:** Dataset ini tidak merekam kebakaran hutan liar yang besar, melainkan pembakaran tumpukan sisa-sisa hutan yang terencana (*prescribed burning slash piles*). Pembakaran skala kecil ini ideal untuk meneliti deteksi titik api sejak dini.
- **Lokasi & Cuaca:** Pengambilan data dilakukan di hutan pinus Ponderosa (Observatory Mesa, Flagstaff, Arizona) pada 16 Januari 2020. Kondisinya saat itu adalah musim dingin dengan suhu 43°F (sekitar 6°C), sedikit berawan, dan tanpa angin.

## 2. Perangkat Keras yang Digunakan

Para peneliti menggunakan dua jenis drone (UAV) dan beberapa jenis kamera untuk mendapatkan sudut pandang udara (*aerial imagery*) yang bervariasi:

- **Drone:** DJI Matrice 200 dan DJI Phantom 3 Professional.
- **Kamera Spektrum Normal (RGB):** Kamera Zenmuse X4S (dipasang di Matrice 200) dan kamera bawaan DJI Phantom 3 untuk merekam visual seperti yang dilihat mata manusia.
- **Kamera Termal (Inframerah):** Kamera FLIR Vue Pro R digunakan untuk menangkap panas/suhu dari titik api.

## 3. Format dan Variasi Visual Dataset

- **Format File:** Data mentah tersedia dalam bentuk video (format `.MP4` dan `.MOV`) yang kemudian diekstrak menjadi frame gambar (format `.JPEG` dan `.PNG`).
- **Variasi Palet Visual:** Dataset merekam empat jenis palet visual yang berbeda, yaitu Spektrum Normal (RGB), serta tiga palet termal yakni Fusion, WhiteHot, dan GreenHot.

## 4. Rincian Jumlah Data

Dari video yang direkam, peneliti membaginya menjadi set gambar siap pakai untuk dua task Machine Learning yang berbeda. Untuk binary classification, mereka hanya menggunakan gambar spektrum normal (RGB).

- **Data Training & Validasi (Klasifikasi):** Terdapat 39.375 frame (25.018 gambar ada api dan 14.357 tanpa api) yang diambil dari kamera Zenmuse. Gambar-gambar ini memiliki resolusi 254 x 254 piksel.
- **Data Testing (Klasifikasi):** Terdapat 8.617 frame (5.137 gambar ada api dan 3.480 tanpa api) yang diambil secara terpisah dari kamera Phantom. Ukurannya juga 254 x 254 piksel.
- **Data Segmentasi (Sebagai info tambahan):** Untuk mendeteksi letak batas api (*segmentation*), tersedia dataset terpisah berisi 2.003 frame gambar beresolusi tinggi (3480 x 2160 piksel) yang dilengkapi dengan file gambar mask biner (hitam-putih) yang dianotasi manual oleh pakar untuk menandai lokasi piksel api secara presisi.
