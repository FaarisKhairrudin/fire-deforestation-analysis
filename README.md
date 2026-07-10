# Fire-Deforestation Analysis — Provinsi Jambi (2020–2025)

Analisis spasio-temporal deforestasi dan kebakaran hutan/lahan di Provinsi Jambi menggunakan **Google Earth Engine (GEE)** dengan fusi multi-sensor (Landsat 8/9, Sentinel-2, MODIS, VIIRS).

## Fokus Utama: GEE

Seluruh proses inti penelitian dilakukan di **Google Earth Engine**. Dokumentasi dan kode berada di folder [`GEE/`](GEE/):

| Isi | Deskripsi |
|-----|-----------|
| [`GEE/code/`](GEE/code/) | Skrip JavaScript GEE Tahap 1–4 |
| [`GEE/data/`](GEE/data/) | Hasil ekstraksi tabel statistik (CSV) |
| [`GEE/documentation/`](GEE/documentation/) | Dokumentasi hasil analisis |
| [`GEE/PENJELASAN.md`](GEE/PENJELASAN.md) | **Penjelasan konsep lengkap Tahap 1–4** |
| [`GEE/analysis_visualization.ipynb`](GEE/analysis_visualization.ipynb) | Visualisasi Python dari data CSV |
| [`GEE/TASK_METHODOLOGY.md`](GEE/TASK_METHODOLOGY.md) | Metodologi penelitian |
| [`GEE/TASK.md`](GEE/TASK.md) | Panduan implementasi teknis GEE |

## Metodologi Singkat

```
TAHAP 1: Preprocessing & Komposit Tahunan
         Landsat 8/9 + Sentinel-2 → Cloud masking → Median compositing
TAHAP 2: Deforestasi Mapping
         NDVI differencing (threshold 0.2) → Validasi GFW Hansen
TAHAP 3: Fire Analysis
         Hotspot MODIS/VIIRS → dNBR Burn Severity → Validasi MCD64A1
TAHAP 4: Spatial Relationship
         Overlay deforestasi × api → Mechanical vs Burning Clearing
```

## Hasil Utama

| Metrik | Nilai |
|--------|-------|
| Total Deforestasi (GFW) | 438.475 Ha |
| Deforestasi Terkait Api | **< 1%** |
| Dominasi Pembukaan Lahan | **Mekanis (non-bakar)** |

## Struktur Repository

```
├── GEE/                 # Kode & data GEE (fokus utama)
│   ├── code/            # Skrip JavaScript GEE
│   ├── data/            # CSV hasil ekstraksi
│   ├── documentation/   # Hasil & interpretasi
│   └── PENJELASAN.md    # Penjelasan konsep lengkap
├── QGIS/                # File proyek QGIS
├── notebooks/           # Notebook Python lainnya
├── data/                # Data pendukung
├── src/                 # Helper functions
└── papper/              # Draft paper
```

## Cara Menjalankan

Lihat [PENJELASAN.md bagian 7](GEE/PENJELASAN.md#7-panduan-file-kode) untuk panduan menjalankan skrip GEE.

## Tools

- **Google Earth Engine** — Pengolahan citra satelit utama
- **Python** (pandas, matplotlib) — Visualisasi tambahan
- **QGIS** — Analisis spasial lanjutan
