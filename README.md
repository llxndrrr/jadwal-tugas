# Tugasku

Aplikasi web untuk mengatur tugas, ulangan, dan jadwal belajar mingguan. Aplikasinya langsung menunjukkan sesi apa yang sedang berjalan sekarang dan apa yang berikutnya.

**🔗 Coba langsung:** https://llxndrrr.github.io/jadwal-tugas/

## Fitur

- **Status sekarang**: menampilkan sesi yang sedang berlangsung, sisa waktunya, jam istirahat, dan sesi berikutnya.
- **Tugas**: catat tugas beserta deadline-nya. Tugas yang mepet atau lewat deadline diberi warna berbeda.
- **Ulangan**: daftar ulangan yang akan datang, dengan hitung mundur harinya.
- **Jadwal**: jadwal mingguan yang jam sesi dan hari kuliahnya bisa kamu atur sendiri, termasuk sesi dosen dan self learning.
- **Pengingat** untuk tugas dan ulangan yang sudah dekat.
- **Simpan ke cloud (opsional)**: masuk dengan akun Google, data tersinkron otomatis antara HP dan laptop.
- **Backup & pulihkan** data lewat file.
- **Animasi ombak** yang lembut di tampilannya.

## Privasi

Tanpa masuk akun, semua data tersimpan di **browser kamu sendiri** (`localStorage`) dan nggak dikirim ke mana pun.

Kalau kamu memilih **masuk dengan Google**, isi aplikasi juga disimpan di Firebase Firestore, satu dokumen per akun. [Aturan keamanannya](firestore.rules) memastikan setiap akun **hanya bisa membaca dan mengubah datanya sendiri**. Aturan ini sudah dites di Firebase Emulator dengan 20 skenario, termasuk percobaan membaca data akun lain dan menulis tanpa login. Saat keluar, kamu bisa memilih menghapus data dari perangkat itu.

## Teknologi

- HTML, CSS, dan JavaScript murni, tanpa framework
- SVG untuk animasi ombak
- `localStorage` untuk penyimpanan di browser
- Firebase Authentication (login Google) dan Cloud Firestore untuk sinkron cloud, dengan SDK yang dibundel di repo (tanpa CDN)
- Font: Plus Jakarta Sans (Google Fonts)

## Cara menjalankan

1. Download atau clone repo ini.
2. Buka `index.html` di browser.

Selesai. Nggak perlu install apa-apa.

---

Dibuat oleh [Abraham Alex](https://github.com/llxndrrr).
