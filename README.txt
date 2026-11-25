SPINLAB
Aplikasi Spin Wheel untuk HP (Android)
HTML5 Canvas + CSS3 + JavaScript, dibungkus menjadi APK dengan Capacitor

======================================================================
1. ISI PROYEK
======================================================================
SpinLab/
|-- www/                      <- seluruh isi aplikasi (yang dimuat di HP)
|   |-- index.html            <- struktur tampilan
|   |-- styles.css            <- seluruh desain (layout potret)
|   |-- renderer.js           <- roda, animasi, suara, popup, konfeti, getar
|   |-- wheel-logic.js        <- sektor, pengacakan crypto, hitung posisi akhir
|   `-- assets/               <- logo-spinlab.svg + font Poppins (lokal, OFL)
|-- resources/                <- sumber ikon & splash (dipakai langkah 4)
|-- test/validate.js          <- pengujian peluang & sinkron pointer
|-- capacitor.config.json     <- nama & ID aplikasi
|-- serve.js                  <- server kecil untuk mencoba di browser HP
`-- package.json

======================================================================
2. HADIAH & PELUANG
======================================================================
Roda = 13 sektor sama besar:
   Mystery Box 1 | Ganci 3 | Stiker 4 | Tumbler 1 | Pena 2 | Zonk 2
ATURAN MYSTERY BOX:
 - Mystery Box HANYA didapat pada putaran ke-100, ke-200, ke-300, dst. (pasti dapat).
 - Pada putaran lain (1-99, 101-199, ...) Mystery Box tidak mungkin keluar.
 - Penghitung putaran disimpan di perangkat (localStorage), jadi tidak ter-reset saat
   aplikasi ditutup. Untuk mengulang dari 0: hapus data aplikasi (Pengaturan > Aplikasi >
   SpinLab > Penyimpanan > Hapus data). Interval diubah lewat MYSTERY_INTERVAL di
   www/wheel-logic.js.
PUTARAN BIASA:
 Di antara 12 sektor selain Mystery Box, masing-masing berpeluang SAMA: 1/12 (8,3%),
 acak murni (crypto.getRandomValues + rejection sampling). Peluang per jenis:
   Stiker 33,3% | Ganci 25,0% | Pena 16,7% | Zonk 16,7% | Tumbler 8,3%
Tiap putaran berdiri sendiri dan hadiah tidak pernah habis.
Hasil ditentukan saat pengguna menekan STOP (sebelum pengereman), lalu rotasi akhir
dihitung matematis agar pointer (arah jam 12) berhenti tepat di sektor tersebut.
Waktu menekan STOP tidak mempengaruhi hasil. Popup membaca hadiah dari sektor yang
benar-benar ditunjuk pointer.
Susunan sektor ada di LAYOUT dan nama tampilan di LABELS (www/wheel-logic.js).
Mengubah jumlah sektor cukup dengan menambah/mengurangi baris di LAYOUT
(pastikan dua sektor bersebelahan tidak sama warna), lalu jalankan: npm test

======================================================================
3. MENCOBA DI BROWSER (TANPA ANDROID STUDIO)
======================================================================
   npm install
   npm run serve
Buka http://localhost:8080 di browser komputer, atau http://<IP-komputer>:8080
dari HP yang terhubung ke Wi-Fi yang sama.

======================================================================
4. MEMBUAT APK ANDROID
======================================================================
Prasyarat: Node.js 20+, Android Studio (sudah termasuk JDK & Android SDK).

   npm install
   npx cap add android          (sekali saja, membuat folder android/)
   npm run icons                (membuat ikon & splash dari folder resources/)
   npm run sync                 (menyalin www/ ke proyek Android)
   npm run open                 (membuka Android Studio)

Di Android Studio:
   - Kunci layar potret: buka android/app/src/main/AndroidManifest.xml, pada
     tag <activity ...> tambahkan   android:screenOrientation="portrait"
   - Uji: sambungkan HP (USB debugging aktif) lalu tekan tombol Run.
   - APK untuk dibagikan: menu Build > Build Bundle(s) / APK(s) > Build APK(s).
     (Untuk Play Store: Build > Generate Signed Bundle / APK.)

Setiap kali mengubah isi folder www/, jalankan lagi:  npm run sync

======================================================================
5. CARA PAKAI
======================================================================
 - Ketuk SPIN: roda berputar terus dan TIDAK berhenti sendiri.
 - Ketuk STOP (tombol berubah merah) untuk menghentikan roda; roda mengerem pelan lalu hasil muncul.
 - Popup hasil: SPIN LAGI (langsung putar lagi) atau TUTUP.
 - Ikon speaker (kanan atas) = suara ON/OFF.
 - Hadiah memunculkan konfeti & getar; Mystery Box / Tumbler lebih meriah.

======================================================================
6. MENGGANTI LOGO & IKON
======================================================================
 - Logo di layar (kiri atas): www/assets/logo-labkes.png. Tulisan di sebelahnya ada di
   www/index.html (id="brand-name"), memakai font Poppins yang sama dengan aplikasi.
 - Ikon aplikasi: timpa file di resources/ (icon-only.png, icon-foreground.png,
   icon-background.png, splash.png; ukuran 1024 / 2732 px), lalu jalankan
   npm run icons dan npm run sync.
 - Nama tampilan & ID aplikasi: capacitor.config.json (appName, appId)
   sebelum menjalankan  npx cap add android.

======================================================================
7. PENGUJIAN
======================================================================
   npm test      (struktur roda, peluang, bias, sinkron pointer)

======================================================================
8. CARA TERCEPAT: BUILD APK DI GITHUB (tanpa Android Studio)
======================================================================
 1. Buat akun gratis di github.com, lalu buat repository baru (Private boleh).
 2. Pilih "uploading an existing file", seret SELURUH ISI folder SpinLab
    (termasuk folder .github), lalu Commit.
 3. Buka tab Actions > "Build APK" > Run workflow. Tunggu sekitar 5-10 menit.
 4. Buka hasil run yang hijau > bagian Artifacts > unduh "SpinLab-APK" (zip
    berisi app-debug.apk).
 5. Kirim APK ke HP, ketuk untuk memasang (izinkan "Install unknown apps").
