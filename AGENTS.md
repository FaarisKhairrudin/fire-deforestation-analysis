# Aturan Kerja Proyek Fire-Drone

## Konfirmasi Sebelum Mengubah Kode
- WAJIB: sebelum mengubah/menulis kode apa pun, jelaskan dulu rencana perubahan (apa yang diubah, kenapa, dampaknya) lalu minta konfirmasi (acc) dari user.
- Baru eksekusi setelah user menyetujui. Perbaikan typo kecil pun tetap disebutkan dulu.

## Anti-Halusinasi & Verifikasi
- Maksimalkan sumber eksternal: gunakan MCP context7 untuk dokumentasi resmi library (earthengine-api, geemap, dll) dan webfetch/websearch untuk referensi terbaru.
- Jangan menebak nama API, band satelit, ID dataset GEE, atau parameter fungsi. Verifikasi dulu ke dokumentasi resmi (developers.google.com/earth-engine untuk dataset catalog).
- Jika tidak menemukan sumber yang memverifikasi, katakan terang-terangan "tidak yakin / tidak terverifikasi", jangan mengarang.

## Tingkat Keyakinan
- Setiap usulan perubahan sertakan tingkat keyakinan efektivitasnya, misal: `Keyakinan: tinggi (terverifikasi dari dokumentasi resmi GEE)` atau `Keyakinan: sedang (berdasarkan reasoning, belum ada referensi langsung)`.
- Sebutkan sumbernya: hasil pencarian dokumentasi, atau murni reasoning.

## Efisiensi Model
- Untuk eksplorasi kode, pencarian file, dan riset dokumentasi yang panjang, delegasikan ke subagent (explore/general) agar hemat token model utama.

## Fokus Pekerjaan Saat Ini
1. PRIORITAS: analisis Google Earth Engine di folder `GEE/`, mengikuti tahapan di `GEE/TASK_METHODOLOGY.md` (5 tahap: preprocessing, deforestation mapping, fire/burn severity, spatial relationship, integrated analysis + UAV validation).
2. NANTI (setelah analisis GEE selesai): permodelan image classification. Jangan mulai tahap ini tanpa instruksi user.

## Bahasa
- Komunikasi dengan user dalam Bahasa Indonesia.

## Notebook conventions

- **1 cell = 1 logical unit** (1 output or none). Never merge multiple independent outputs into one cell.
- **Python 3.12** (system installed, no virtual env).
- **Markdown style**:
  - Centered title with `<div align="center">` for the project/notebook title.
  - Main sections: `## ***Section Name***` followed by `---`.
  - Subsections: `### ***Subsection Name***` (no horizontal rule).
  - No emoji, no decorative filler.
  - Short explanations scoped to the current group.
  - Write conclusions after running and inspecting the output, not before.
