'use strict';

/* =========================================================
   1. PENGATURAN DASAR: jam sesi & istirahat
   ========================================================= */
const KUNCI_SIMPAN = 'jadwalTugas.v1';
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Jam sesi & hari kuliah BAWAAN. Pengguna bisa mengubahnya lewat "Atur jam & hari"
// (disimpan di data.sesi dan data.hari, ikut ter-backup).
const SESI_AWAL = [
  { mulai: '08:00', selesai: '09:30' },
  { mulai: '10:00', selesai: '11:30' },
  { mulai: '13:00', selesai: '14:30' },
  { mulai: '15:00', selesai: '16:30' },
];
const HARI_AWAL = [1, 2, 3, 4, 5];            // Senin–Jumat
const URUT_HARI = [1, 2, 3, 4, 5, 6, 0];      // urutan tampil: Senin ... Minggu
const MAKS_SESI = 8;
const POLA_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Diisi ulang oleh hitungSesi() setiap kali pengaturan jam berubah.
// JEDA = celah di antara dua sesi; "setelah" = jeda ini datang setelah sesi ke berapa (0 = sesi 1)
let SESI = [];
let JEDA = [];

/* =========================================================
   2. MENYIMPAN & MEMUAT DATA (localStorage)
   ========================================================= */
function dataKosong(nSesi = SESI_AWAL.length) {
  const jadwal = {};
  for (let h = 0; h <= 6; h++) jadwal[h] = Array(nSesi).fill(null);   // 0 = Minggu, 1 = Senin ... 6 = Sabtu
  return { versi: 2, sesi: SESI_AWAL.map(s => ({ ...s })), hari: [...HARI_AWAL], jadwal, tugas: [], ulangan: [], terakhirBackup: null };
}

// Jam sesi: harus "HH:MM", mulai < selesai, urut, tidak bertabrakan. Kalau rusak -> pakai bawaan.
function rapikanSesi(daftar) {
  if (!Array.isArray(daftar)) return null;
  const s = daftar
    .filter(x => x && POLA_JAM.test(x.mulai) && POLA_JAM.test(x.selesai) && x.mulai < x.selesai)
    .map(x => ({ mulai: x.mulai, selesai: x.selesai }))
    .slice(0, MAKS_SESI);
  if (!s.length || s.length !== daftar.length) return null;
  for (let i = 1; i < s.length; i++) if (s[i].mulai < s[i - 1].selesai) return null;
  return s;
}

// Memastikan bentuk data benar (dari localStorage maupun file backup)
function rapikan(d) {
  const sesi = rapikanSesi(d && d.sesi) || SESI_AWAL.map(s => ({ ...s }));
  const k = dataKosong(sesi.length);
  k.sesi = sesi;
  const hari = (d && Array.isArray(d.hari) ? d.hari : []).map(Number).filter(h => Number.isInteger(h) && h >= 0 && h <= 6);
  if (hari.length) k.hari = URUT_HARI.filter(h => hari.includes(h));
  if (d && d.jadwal && typeof d.jadwal === 'object') {
    for (let h = 0; h <= 6; h++) {
      const baris = Array.isArray(d.jadwal[h]) ? d.jadwal[h] : [];
      k.jadwal[h] = sesi.map((_, i) => {
        const c = baris[i];
        if (!c) return null;
        const matkul = String(c.matkul || '').trim().slice(0, 50);
        const jenis = c.jenis === 'self' ? 'self' : 'dosen';
        if (!matkul && jenis === 'dosen') return null;
        return { matkul, jenis, dosen: String(c.dosen || '').trim().slice(0, 50) };
      });
    }
  }
  k.tugas = (d && Array.isArray(d.tugas) ? d.tugas : [])
    .filter(t => t && String(t.nama || '').trim() && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline))
    .map(t => ({
      id: String(t.id || idBaru()),
      nama: String(t.nama).trim().slice(0, 80),
      matkul: String(t.matkul || '').trim().slice(0, 50),
      deadline: t.deadline,
      jam: /^\d{2}:\d{2}$/.test(t.jam || '') ? t.jam : '',
      sumber: t.sumber === 'dosen' ? 'dosen' : 'web',
      catatan: String(t.catatan || '').slice(0, 120),
      selesai: !!t.selesai,
      selesaiPada: Number(t.selesaiPada) || null,
      dibuat: Number(t.dibuat) || 0,
    }));
  k.ulangan = (d && Array.isArray(d.ulangan) ? d.ulangan : [])
    .filter(u => u && String(u.matkul || '').trim() && /^\d{4}-\d{2}-\d{2}$/.test(u.tanggal))
    .map(u => ({
      id: String(u.id || idBaru()),
      jenis: ['kuis', 'uts', 'uas', 'lain'].includes(u.jenis) ? u.jenis : 'lain',
      jenisLain: String(u.jenisLain || '').trim().slice(0, 30),
      matkul: String(u.matkul).trim().slice(0, 50),
      tanggal: u.tanggal,
      jam: /^\d{2}:\d{2}$/.test(u.jam || '') ? u.jam : '',
      materi: String(u.materi || '').slice(0, 120),
      nilai: String(u.nilai || '').trim().slice(0, 10),
      dibuat: Number(u.dibuat) || 0,
    }));
  k.terakhirBackup = (d && Number(d.terakhirBackup)) || null;
  return k;
}

function muat() {
  let teks = null;
  try { teks = localStorage.getItem(KUNCI_SIMPAN); }
  catch (e) { alert('Browser ini tidak mengizinkan penyimpanan. Data tidak akan tersimpan.'); return dataKosong(); }
  if (!teks) return dataKosong();
  try { return rapikan(JSON.parse(teks)); }
  catch (e) {
    try { localStorage.setItem(KUNCI_SIMPAN + '.rusak-' + Date.now(), teks); } catch (_) { /* abaikan */ }
    alert('Data tersimpan tidak bisa dibaca. Salinannya sudah diamankan. Kamu bisa memulihkan dari file backup.');
    return dataKosong();
  }
}
function simpanLokal() {
  try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(data)); }
  catch (e) { alert('Gagal menyimpan: ' + e.message); }
}
// Setiap perubahan dari pengguna: simpan di browser, lalu beri tahu cloud.js (kalau sedang masuk akun)
function simpan() {
  simpanLokal();
  if (typeof window.saatSimpan === 'function') window.saatSimpan();
}
function idBaru() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let data = muat();

function hitungSesi() {
  SESI = data.sesi.map((s, i) => ({ no: i + 1, mulai: s.mulai, selesai: s.selesai }));
  JEDA = [];
  for (let i = 0; i < SESI.length - 1; i++) {
    if (SESI[i].selesai < SESI[i + 1].mulai) JEDA.push({ nama: 'Istirahat', mulai: SESI[i].selesai, selesai: SESI[i + 1].mulai, setelah: i });
  }
}
hitungSesi();

/* =========================================================
   3. ALAT BANTU
   ========================================================= */
const $ = id => document.getElementById(id);
const menit = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const jam = s => s.replace(':', '.');                               // "08:00" -> "08.00"
function isoTanggal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function selisihHari(dari, sampai) {
  const [y1, m1, d1] = dari.split('-').map(Number);
  const [y2, m2, d2] = sampai.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function tanggalPendek(iso) { const [, m, d] = iso.split('-').map(Number); return `${d} ${BULAN_PENDEK[m - 1]}`; }
function durasi(mnt) {
  if (mnt < 60) return `${mnt} menit`;
  const j = Math.floor(mnt / 60), s = mnt % 60;
  return s ? `${j} jam ${s} menit` : `${j} jam`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const namaSel = c => c.matkul || 'Self learning';
const tag = teks => `<span class="tag">${esc(teks)}</span>`;

// Daftar semua nama mata kuliah (dari jadwal + tugas), untuk saran & filter
function daftarMatkul() {
  const set = new Set();
  for (let h = 0; h <= 6; h++) for (const c of data.jadwal[h]) if (c && c.matkul) set.add(c.matkul);
  for (const t of data.tugas) if (t.matkul) set.add(t.matkul);
  for (const u of data.ulangan) set.add(u.matkul);
  return [...set].sort((a, b) => a.localeCompare(b, 'id'));
}

/* =========================================================
   4. DEADLINE
   ========================================================= */
function deadlineMs(t) {
  const [y, m, d] = t.deadline.split('-').map(Number);
  const [hh, mm] = (t.jam || '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 59).getTime();
}
function labelDeadline(t, sekarang) {
  const sisaHari = selisihHari(isoTanggal(new Date(sekarang)), t.deadline);
  const pukul = t.jam ? ' ' + jam(t.jam) : '';
  if (deadlineMs(t) < sekarang) {
    return { teks: sisaHari < 0 ? `lewat ${-sisaHari} hari` : 'lewat deadline', kelas: 'lewat' };
  }
  if (sisaHari === 0) return { teks: 'hari ini' + pukul, kelas: 'mepet' };
  if (sisaHari === 1) return { teks: 'besok' + pukul, kelas: 'mepet' };
  if (sisaHari <= 3) return { teks: `${sisaHari} hari`, kelas: 'dekat' };
  return { teks: `${sisaHari} hari`, kelas: '' };
}
const tugasBelum = matkul => data.tugas.filter(t => !t.selesai && t.matkul === matkul).length;

/* ---------- Ulangan ---------- */
const JENIS_UL = { kuis: 'Kuis', uts: 'UTS', uas: 'UAS' };
const namaUlangan = u => `${u.jenis === 'lain' ? (u.jenisLain || 'Ulangan') : JENIS_UL[u.jenis]} ${u.matkul}`;
// Ulangan dianggap "sudah lewat" setelah harinya berakhir
function labelUlangan(u, hariIni) {
  const n = selisihHari(hariIni, u.tanggal);
  const pukul = u.jam ? ' ' + jam(u.jam) : '';
  if (n < 0) return { teks: `${-n} hari lalu`, kelas: 'beres', lewat: true };
  if (n === 0) return { teks: 'hari ini' + pukul, kelas: 'mepet' };
  if (n === 1) return { teks: 'besok' + pukul, kelas: 'mepet' };
  return { teks: `${n} hari lagi`, kelas: n <= 3 ? 'dekat' : '' };
}
const urutUlangan = (a, b) => (a.tanggal + (a.jam || '99')).localeCompare(b.tanggal + (b.jam || '99'));

/* =========================================================
   5. STATUS "SEKARANG" (bagian hijau)
   ========================================================= */
// Hari kuliah berikutnya setelah hari h (melompati hari libur)
function hariKuliahBerikut(h) {
  for (let n = 1; n <= 7; n++) { const x = (h + n) % 7; if (data.hari.includes(x)) return x; }
  return h;
}
const jadwalKosong = () => data.hari.every(h => data.jadwal[h].every(c => !c));

function teksSesi(hari, i) {
  const s = SESI[i], c = data.jadwal[hari][i];
  const isi = !c ? '<i>kosong</i>'
    : (c.jenis === 'self' && !c.matkul) ? 'Self learning'
    : `${esc(namaSel(c))}${tag(c.jenis === 'self' ? 'self learning' : 'dosen')}`;
  return `Sesi ${s.no} · ${jam(s.mulai)} · ${isi}`;
}

function hitungStatus(d) {
  const hari = d.getDay();
  const m = d.getHours() * 60 + d.getMinutes();
  const besok = (hari + 1) % 7;
  const nb = hariKuliahBerikut(hari);
  const labelNb = nb === besok ? 'Besok' : nb === hari ? `${HARI[nb]} depan` : HARI[nb];
  const berikutHariLain = `${labelNb} → ${teksSesi(nb, 0)}`;

  // Pengguna baru: jadwal belum diisi sama sekali -> ajak mengatur dulu
  if (jadwalKosong()) {
    return { kecil: 'Mulai dari sini', judul: 'Jadwalmu belum diisi',
      sub: 'Atur jam kuliahmu dan isi mata kuliahnya. Setelah itu bagian ini otomatis menampilkan sesi yang sedang berjalan.',
      berikut: '', aktif: null, kosong: true };
  }
  if (!data.hari.includes(hari)) {
    return { kecil: HARI[hari], judul: (hari === 0 || hari === 6) ? 'Akhir pekan' : 'Hari libur', sub: 'Tidak ada kuliah hari ini.', berikut: `Berikutnya: ${berikutHariLain}`, aktif: null };
  }
  if (m < menit(SESI[0].mulai)) {
    return { kecil: `${HARI[hari]} · belum mulai`, judul: `Kuliah mulai ${jam(SESI[0].mulai)}`,
      sub: `${durasi(menit(SESI[0].mulai) - m)} lagi`, berikut: `Pertama: ${teksSesi(hari, 0)}`, aktif: null };
  }
  for (let i = 0; i < SESI.length; i++) {
    const s = SESI[i];
    if (m >= menit(s.mulai) && m < menit(s.selesai)) {
      const c = data.jadwal[hari][i];
      const sisa = `berakhir ${durasi(menit(s.selesai) - m)} lagi`;
      let sub;
      if (!c) sub = `Belum diisi di jadwal · ${sisa}`;
      else if (c.jenis === 'self') sub = `${tag('self learning')} · ${sisa}`;
      else sub = `${esc(c.dosen || 'Dosen')}${tag('dosen')} · ${sisa}`;
      const j = JEDA.find(x => x.setelah === i);
      const berikut = i < SESI.length - 1
        ? (j ? `Berikutnya: istirahat ${jam(j.mulai)} → ${teksSesi(hari, i + 1)}` : `Berikutnya: ${teksSesi(hari, i + 1)}`)
        : `Berikutnya: selesai ${jam(s.selesai)} · ${berikutHariLain}`;
      return { kecil: `Sekarang · Sesi ${s.no} · ${jam(s.mulai)}–${jam(s.selesai)}`,
        judul: c ? namaSel(c) : 'Sesi kosong', sub, berikut, aktif: { hari, i } };
    }
  }
  for (const j of JEDA) {
    if (m >= menit(j.mulai) && m < menit(j.selesai)) {
      const berikut = `Berikutnya: ${teksSesi(hari, j.setelah + 1)}`;
      return { kecil: `${HARI[hari]} · ${j.nama} ${jam(j.mulai)}–${jam(j.selesai)}`,
        judul: j.nama, sub: `${durasi(menit(j.selesai) - m)} lagi`, berikut, aktif: null };
    }
  }
  return { kecil: HARI[hari], judul: 'Kuliah hari ini selesai', sub: 'Waktunya ngerjain tugas, atau istirahat.',
    berikut: `Berikutnya: ${berikutHariLain}`, aktif: null };
}

/* =========================================================
   6. STATUS TAMPILAN (tidak disimpan)
   ========================================================= */
const ui = {
  view: 'tugas',
  filter: '',           // nama mata kuliah, '' = semua
  editTugasId: null,
  sumber: 'web',
  sel: null,            // { hari, i } sesi yang sedang diedit
  jenis: 'dosen',
  editUlId: null,
  jenisUl: 'kuis',
};

/* =========================================================
   7. MENAMPILKAN (render)
   ========================================================= */
function renderSemua() {
  renderView();
  renderSekarang();
  renderTugas();
  renderUlangan();
  renderJadwal();
  renderPengingat();
  $('list-matkul').innerHTML = daftarMatkul().map(m => `<option value="${esc(m)}">`).join('');
}

function renderView() {
  document.querySelectorAll('.pil[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === ui.view));
  $('view-tugas').hidden = ui.view !== 'tugas';
  $('view-jadwal').hidden = ui.view !== 'jadwal';
  $('view-ulangan').hidden = ui.view !== 'ulangan';
}

function renderSekarang() {
  const d = new Date();
  const s = hitungStatus(d);
  $('now-kecil').textContent = s.kecil;
  $('now-judul').textContent = s.judul;
  $('now-sub').innerHTML = s.sub;
  $('now-berikut').innerHTML = s.berikut;

  // Tombol cepat untuk mata kuliah yang sedang berjalan
  const c = s.aktif && data.jadwal[s.aktif.hari][s.aktif.i];
  if (s.kosong) {
    $('now-aksi').innerHTML = '<button type="button" class="mini-btn utama" data-atur-jadwal>Atur jadwalku</button>';
  } else if (c && c.matkul) {
    const n = tugasBelum(c.matkul);
    $('now-aksi').innerHTML =
      `<button type="button" class="mini-btn" data-lihat="${esc(c.matkul)}">Tugas ${esc(c.matkul)} (${n})</button>` +
      `<button type="button" class="mini-btn" data-tambah="${esc(c.matkul)}">+ Tugas ${esc(c.matkul)}</button>`;
  } else {
    $('now-aksi').innerHTML = '';
  }

  // Pengingat ulangan dalam 14 hari ke depan (maksimal 2 yang terdekat)
  const hariIniIso = isoTanggal(d);
  $('now-ulangan').innerHTML = data.ulangan
    .filter(u => { const n = selisihHari(hariIniIso, u.tanggal); return n >= 0 && n <= 14; })
    .sort(urutUlangan).slice(0, 2)
    .map(u => {
      const l = labelUlangan(u, hariIniIso);
      return `<button type="button" class="mini-btn ${l.kelas === 'mepet' ? 'mepet' : ''}" data-ke-ulangan>Ulangan: ${esc(namaUlangan(u))} · ${esc(l.teks)}</button>`;
    }).join('');

  // Strip sesi hari ini
  const hari = d.getDay();
  if (!s.kosong && data.hari.includes(hari)) {
    const m = d.getHours() * 60 + d.getMinutes();
    $('now-strip').style.setProperty('--n', SESI.length <= 6 ? SESI.length : 4);   // 5–6 sesi muat 1 baris, 7–8 jadi 2 baris
    $('now-strip').innerHTML = SESI.map((sesi, i) => {
      const cell = data.jadwal[hari][i];
      const kelas = m >= menit(sesi.selesai) ? 'lewat' : (m >= menit(sesi.mulai) ? 'aktif' : '');
      return `<div class="strip-item ${kelas}"><span>${jam(sesi.mulai)}–${jam(sesi.selesai)}</span><b>${cell ? esc(namaSel(cell)) : '—'}</b></div>`;
    }).join('');
  } else {
    $('now-strip').innerHTML = '';
  }
}

function barisTugas(t, sekarang) {
  const info = [t.matkul || 'Tanpa mata kuliah', t.sumber === 'dosen' ? 'dari dosen' : 'web kampus',
    `deadline ${tanggalPendek(t.deadline)}${t.jam ? ' ' + jam(t.jam) : ''}`].map(esc).join(' · ');
  const dl = t.selesai
    ? { teks: `selesai ${t.selesaiPada ? tanggalPendek(isoTanggal(new Date(t.selesaiPada))) : ''}`, kelas: 'beres' }
    : labelDeadline(t, sekarang);
  return `<li class="tugas ${t.selesai ? 'selesai' : dl.kelas === 'lewat' ? 'lewat' : ''}">
    <button type="button" class="cek ${t.selesai ? 'on' : ''}" data-cek="${esc(t.id)}" aria-label="${t.selesai ? 'Tandai belum selesai' : 'Tandai selesai'}">✓</button>
    <div class="isi">
      <b>${esc(t.nama)}</b>
      <small>${info}</small>
      ${t.catatan ? `<small class="catatan">${esc(t.catatan)}</small>` : ''}
    </div>
    <span class="dl ${dl.kelas}">${esc(dl.teks)}</span>
    <span class="aksi">
      <button type="button" class="link" data-ubah="${esc(t.id)}">ubah</button>
      <button type="button" class="link" data-hapus="${esc(t.id)}">hapus</button>
    </span>
  </li>`;
}

function renderTugas() {
  const sekarang = Date.now();
  const semuaMatkul = daftarMatkul();
  if (ui.filter && !semuaMatkul.includes(ui.filter)) ui.filter = '';

  // Filter per mata kuliah
  $('filter').innerHTML = semuaMatkul.length
    ? [`<button type="button" class="chip ${ui.filter ? '' : 'on'}" data-filter="">Semua</button>`,
       ...semuaMatkul.map(m => `<button type="button" class="chip ${ui.filter === m ? 'on' : ''}" data-filter="${esc(m)}">${esc(m)}</button>`)].join('')
    : '';

  const cocok = t => !ui.filter || t.matkul === ui.filter;
  const belum = data.tugas.filter(t => !t.selesai && cocok(t)).sort((a, b) => deadlineMs(a) - deadlineMs(b));
  const lewat = belum.filter(t => deadlineMs(t) < sekarang);
  const aktif = belum.filter(t => deadlineMs(t) >= sekarang);
  const selesai = data.tugas.filter(t => t.selesai && cocok(t)).sort((a, b) => (b.selesaiPada || 0) - (a.selesaiPada || 0));

  $('grup-lewat').hidden = !lewat.length;
  $('daftar-lewat').innerHTML = lewat.map(t => barisTugas(t, sekarang)).join('');

  const kosong = !data.tugas.length
    ? 'Belum ada tugas. Tekan <b>+ Tugas</b> untuk mencatat tugas pertamamu.'
    : ui.filter ? `Tidak ada tugas yang belum selesai untuk ${esc(ui.filter)}.` : 'Semua tugas sudah selesai. Mantap!';
  $('daftar-belum').innerHTML = aktif.length ? aktif.map(t => barisTugas(t, sekarang)).join('') : `<li class="kosong">${kosong}</li>`;

  $('grup-selesai').hidden = !selesai.length;
  $('judul-selesai').textContent = `Selesai (${selesai.length})`;
  $('daftar-selesai').innerHTML = selesai.map(t => barisTugas(t, sekarang)).join('');

  const totalBelum = data.tugas.filter(t => !t.selesai).length;
  const totalLewat = data.tugas.filter(t => !t.selesai && deadlineMs(t) < sekarang).length;
  $('tugas-ringkas').textContent = totalBelum
    ? `${totalBelum} belum selesai${totalLewat ? ` · ${totalLewat} lewat deadline` : ''}`
    : 'Tidak ada tugas yang tertunda.';
}

function barisUlangan(u, hariIni) {
  const [, m, tgl] = u.tanggal.split('-').map(Number);
  const [y] = u.tanggal.split('-').map(Number);
  const l = labelUlangan(u, hariIni);
  const info = [HARI[new Date(y, m - 1, tgl).getDay()] + (u.jam ? ' ' + jam(u.jam) : ''), u.materi].filter(Boolean).map(esc).join(' · ');
  const kanan = !l.lewat ? `<span class="dl ${l.kelas}">${esc(l.teks)}</span>`
    : u.nilai ? `<span class="nilai" title="Nilai">${esc(u.nilai)}</span>`
    : `<button type="button" class="link" data-ubah-ul="${esc(u.id)}">isi nilai</button>`;
  return `<li class="tugas ${l.lewat ? 'ul-lewat' : ''}">
    <span class="tgl"><b>${tgl}</b><span>${BULAN_PENDEK[m - 1]}</span></span>
    <div class="isi">
      <b>${esc(namaUlangan(u))}</b>
      <small>${info}</small>
    </div>
    ${kanan}
    <span class="aksi">
      <button type="button" class="link" data-ubah-ul="${esc(u.id)}">ubah</button>
      <button type="button" class="link" data-hapus-ul="${esc(u.id)}">hapus</button>
    </span>
  </li>`;
}

function renderUlangan() {
  const hariIni = isoTanggal(new Date());
  const datang = data.ulangan.filter(u => u.tanggal >= hariIni).sort(urutUlangan);
  const lewat = data.ulangan.filter(u => u.tanggal < hariIni).sort((a, b) => urutUlangan(b, a));
  $('daftar-ul-datang').innerHTML = datang.length
    ? datang.map(u => barisUlangan(u, hariIni)).join('')
    : `<li class="kosong">${data.ulangan.length ? 'Tidak ada ulangan dalam waktu dekat.' : 'Belum ada ulangan. Tekan <b>+ Ulangan</b> kalau dosen mengumumkan kuis, UTS, atau UAS.'}</li>`;
  $('grup-ul-lewat').hidden = !lewat.length;
  $('judul-ul-lewat').textContent = `Sudah lewat (${lewat.length})`;
  $('daftar-ul-lewat').innerHTML = lewat.map(u => barisUlangan(u, hariIni)).join('');
  const minggu = datang.filter(u => selisihHari(hariIni, u.tanggal) <= 7).length;
  $('ulangan-ringkas').textContent = datang.length
    ? `${datang.length} akan datang${minggu ? ` · ${minggu} dalam 7 hari` : ''}`
    : 'Tidak ada ulangan yang akan datang.';
}

function renderJadwal() {
  const d = new Date();
  const hariIni = d.getDay();
  const status = hitungStatus(d);
  const daftarHari = data.hari;
  let html = '<div></div>';
  for (const h of daftarHari) html += `<div class="g-hari ${h === hariIni ? 'hari-ini' : ''}">${HARI[h]}</div>`;

  SESI.forEach((s, i) => {
    html += `<div class="g-jam"><b>Sesi ${s.no}</b>${jam(s.mulai)}<br>${jam(s.selesai)}</div>`;
    for (const h of daftarHari) {
      const c = data.jadwal[h][i];
      const kelas = [h === hariIni ? 'hari-ini' : '', status.aktif && status.aktif.hari === h && status.aktif.i === i ? 'sekarang' : ''].join(' ');
      if (!c) {
        html += `<button type="button" class="sel kosong ${kelas}" data-hari="${h}" data-sesi="${i}">+ isi</button>`;
      } else {
        const n = c.matkul ? tugasBelum(c.matkul) : 0;
        html += `<button type="button" class="sel ${kelas}" data-hari="${h}" data-sesi="${i}">
          ${n ? `<span class="jumlah" title="${n} tugas belum selesai">${n}</span>` : ''}
          <b>${esc(namaSel(c))}</b>
          ${c.jenis === 'dosen' && c.dosen ? `<small>${esc(c.dosen)}</small>` : ''}
          ${c.jenis === 'self' && !c.matkul ? '' : `<span class="tag-sel ${c.jenis}">${c.jenis === 'self' ? 'self learning' : 'dosen'}</span>`}
        </button>`;
      }
    }
    const j = JEDA.find(x => x.setelah === i);
    if (j) html += `<div class="g-jeda">${j.nama} ${jam(j.mulai)}–${jam(j.selesai)}</div>`;
  });
  const grid = $('grid-jadwal');
  grid.style.gridTemplateColumns = `86px repeat(${daftarHari.length}, minmax(120px, 1fr))`;
  grid.style.minWidth = `${86 + daftarHari.length * 128}px`;
  grid.innerHTML = html;
}

function renderPengingat() {
  let pesan = '';
  if (data.tugas.length) {
    if (!data.terakhirBackup) { if (data.tugas.length >= 10) pesan = 'Kamu belum pernah backup.'; }
    else {
      const hari = Math.floor((Date.now() - data.terakhirBackup) / 86400000);
      if (hari >= 30) pesan = `Terakhir backup ${hari} hari lalu.`;
    }
  }
  $('pengingat').hidden = !pesan;
  if (pesan) $('pengingat').innerHTML = `<span>${esc(pesan)}</span><button type="button" class="btn-dua" data-backup>Backup sekarang</button>`;
}

/* =========================================================
   8. AKSI: TUGAS
   ========================================================= */
function setSumber(s) {
  ui.sumber = s;
  document.querySelectorAll('#t-sumber button').forEach(b => b.classList.toggle('on', b.dataset.sumber === s));
}

function bukaFormTugas(t, matkulAwal) {
  ui.editTugasId = t ? t.id : null;
  $('dlg-tugas-judul').textContent = t ? 'Ubah tugas' : 'Tugas baru';
  $('t-nama').value = t ? t.nama : '';
  $('t-matkul').value = t ? t.matkul : (matkulAwal || ui.filter || '');
  $('t-tanggal').value = t ? t.deadline : '';
  $('t-jam').value = t ? t.jam : '';
  $('t-catatan').value = t ? t.catatan : '';
  setSumber(t ? t.sumber : 'web');
  $('dlg-tugas').showModal();
  $('t-nama').focus();
}

$('btn-tambah').addEventListener('click', () => bukaFormTugas(null));
$('t-batal').addEventListener('click', () => $('dlg-tugas').close());
$('t-sumber').addEventListener('click', e => { const b = e.target.closest('[data-sumber]'); if (b) setSumber(b.dataset.sumber); });

$('form-tugas').addEventListener('submit', e => {
  e.preventDefault();
  const isi = {
    nama: $('t-nama').value.trim(),
    matkul: $('t-matkul').value.trim(),
    deadline: $('t-tanggal').value,
    jam: $('t-jam').value,
    sumber: ui.sumber,
    catatan: $('t-catatan').value.trim(),
  };
  if (!isi.nama || !isi.deadline) return;
  if (ui.editTugasId) {
    const t = data.tugas.find(x => x.id === ui.editTugasId);
    if (t) Object.assign(t, isi);
  } else {
    data.tugas.push({ id: idBaru(), ...isi, selesai: false, selesaiPada: null, dibuat: Date.now() });
  }
  simpan();
  $('dlg-tugas').close();
  renderSemua();
});

// Klik di daftar tugas: centang, ubah, hapus
$('view-tugas').addEventListener('click', e => {
  const cek = e.target.closest('[data-cek]');
  const ubah = e.target.closest('[data-ubah]');
  const hapus = e.target.closest('[data-hapus]');
  const filter = e.target.closest('[data-filter]');
  if (filter) { ui.filter = filter.dataset.filter; renderTugas(); return; }
  const id = (cek || ubah || hapus || {}).dataset;
  if (!id) return;
  const t = data.tugas.find(x => x.id === (id.cek || id.ubah || id.hapus));
  if (!t) return;
  if (cek) {
    t.selesai = !t.selesai;
    t.selesaiPada = t.selesai ? Date.now() : null;
    simpan(); renderSemua();
  } else if (ubah) {
    bukaFormTugas(t);
  } else if (hapus && confirm(`Hapus tugas "${t.nama}"?`)) {
    data.tugas = data.tugas.filter(x => x.id !== t.id);
    simpan(); renderSemua();
  }
});

// Tombol cepat di bagian hijau
$('now-aksi').addEventListener('click', e => {
  const lihat = e.target.closest('[data-lihat]');
  const tambah = e.target.closest('[data-tambah]');
  if (lihat) { ui.view = 'tugas'; ui.filter = lihat.dataset.lihat; renderSemua(); }
  if (tambah) bukaFormTugas(null, tambah.dataset.tambah);
});
$('now-ulangan').addEventListener('click', e => {
  if (e.target.closest('[data-ke-ulangan]')) { ui.view = 'ulangan'; renderSemua(); }
});

// Pindah tampilan Tugas / Jadwal
document.querySelectorAll('.pil[data-view]').forEach(b => b.addEventListener('click', () => { ui.view = b.dataset.view; renderSemua(); }));

/* =========================================================
   8b. AKSI: ULANGAN
   ========================================================= */
function setJenisUl(j) {
  ui.jenisUl = j;
  document.querySelectorAll('#u-jenis button').forEach(b => b.classList.toggle('on', b.dataset.ul === j));
  $('u-lain-wrap').hidden = j !== 'lain';
}
// Kolom nilai hanya muncul kalau tanggal ulangannya sudah tiba
function cekKolomNilai() {
  const t = $('u-tanggal').value;
  $('u-nilai-wrap').hidden = !(t && t <= isoTanggal(new Date()));
}
// Kalau jam masih kosong: isi otomatis dari jadwal (sesi mata kuliah itu di hari tersebut)
function saranJam() {
  if ($('u-jam').value || !$('u-tanggal').value) return;
  const [y, m, d] = $('u-tanggal').value.split('-').map(Number);
  const hari = new Date(y, m - 1, d).getDay();
  const matkul = $('u-matkul').value.trim().toLowerCase();
  if (!data.hari.includes(hari) || !matkul) return;
  const i = data.jadwal[hari].findIndex(c => c && c.matkul.toLowerCase() === matkul);
  if (i >= 0) $('u-jam').value = SESI[i].mulai;
}

function bukaFormUlangan(u) {
  ui.editUlId = u ? u.id : null;
  $('dlg-ul-judul').textContent = u ? 'Ubah ulangan' : 'Ulangan baru';
  setJenisUl(u ? u.jenis : 'kuis');
  $('u-lain').value = u ? u.jenisLain : '';
  $('u-matkul').value = u ? u.matkul : '';
  $('u-tanggal').value = u ? u.tanggal : '';
  $('u-jam').value = u ? u.jam : '';
  $('u-materi').value = u ? u.materi : '';
  $('u-nilai').value = u ? u.nilai : '';
  cekKolomNilai();
  $('dlg-ulangan').showModal();
  (u && !$('u-nilai-wrap').hidden ? $('u-nilai') : $('u-matkul')).focus();
}

$('btn-tambah-ul').addEventListener('click', () => bukaFormUlangan(null));
$('u-batal').addEventListener('click', () => $('dlg-ulangan').close());
$('u-jenis').addEventListener('click', e => { const b = e.target.closest('[data-ul]'); if (b) setJenisUl(b.dataset.ul); });
$('u-tanggal').addEventListener('change', () => { cekKolomNilai(); saranJam(); });
$('u-matkul').addEventListener('change', saranJam);

$('form-ulangan').addEventListener('submit', e => {
  e.preventDefault();
  const isi = {
    jenis: ui.jenisUl,
    jenisLain: ui.jenisUl === 'lain' ? $('u-lain').value.trim() : '',
    matkul: $('u-matkul').value.trim(),
    tanggal: $('u-tanggal').value,
    jam: $('u-jam').value,
    materi: $('u-materi').value.trim(),
    nilai: $('u-nilai-wrap').hidden ? '' : $('u-nilai').value.trim(),
  };
  if (!isi.matkul || !isi.tanggal) return;
  if (ui.editUlId) {
    const u = data.ulangan.find(x => x.id === ui.editUlId);
    if (u) Object.assign(u, isi);
  } else {
    data.ulangan.push({ id: idBaru(), ...isi, dibuat: Date.now() });
  }
  simpan();
  $('dlg-ulangan').close();
  renderSemua();
});

$('view-ulangan').addEventListener('click', e => {
  const ubah = e.target.closest('[data-ubah-ul]');
  const hapus = e.target.closest('[data-hapus-ul]');
  const id = ubah ? ubah.dataset.ubahUl : hapus ? hapus.dataset.hapusUl : null;
  const u = id && data.ulangan.find(x => x.id === id);
  if (!u) return;
  if (ubah) bukaFormUlangan(u);
  else if (confirm(`Hapus ulangan "${namaUlangan(u)}"?`)) {
    data.ulangan = data.ulangan.filter(x => x.id !== u.id);
    simpan(); renderSemua();
  }
});

/* =========================================================
   9. AKSI: JADWAL
   ========================================================= */
function setJenis(j) {
  ui.jenis = j;
  document.querySelectorAll('#s-jenis button').forEach(b => b.classList.toggle('on', b.dataset.jenis === j));
  $('s-dosen-wrap').hidden = j !== 'dosen';
}

function bukaFormSesi(hari, i) {
  ui.sel = { hari, i };
  const c = data.jadwal[hari][i];
  const s = SESI[i];
  $('s-judul').textContent = `${HARI[hari]} · Sesi ${s.no} · ${jam(s.mulai)}–${jam(s.selesai)}`;
  $('s-matkul').value = c ? c.matkul : '';
  $('s-dosen').value = c ? c.dosen : '';
  setJenis(c ? c.jenis : 'dosen');
  $('s-error').hidden = true;
  $('s-kosongkan').hidden = !c;

  // Tugas yang terkait dengan mata kuliah sesi ini
  if (c && c.matkul) {
    const n = tugasBelum(c.matkul);
    $('s-tugas').hidden = false;
    $('s-tugas').innerHTML = `<span>${n ? `${n} tugas ${esc(c.matkul)} belum selesai` : `Tidak ada tugas ${esc(c.matkul)} yang tertunda`}</span>
      ${n ? `<button type="button" class="btn-dua" data-lihat="${esc(c.matkul)}">Lihat</button>` : ''}
      <button type="button" class="btn-dua" data-tambah="${esc(c.matkul)}">+ Tugas</button>`;
  } else {
    $('s-tugas').hidden = true;
  }
  $('dlg-sesi').showModal();
  $('s-matkul').focus();
}

$('grid-jadwal').addEventListener('click', e => {
  const b = e.target.closest('[data-hari]');
  if (b) bukaFormSesi(Number(b.dataset.hari), Number(b.dataset.sesi));
});
$('s-jenis').addEventListener('click', e => { const b = e.target.closest('[data-jenis]'); if (b) setJenis(b.dataset.jenis); });
$('s-batal').addEventListener('click', () => $('dlg-sesi').close());

$('form-sesi').addEventListener('submit', e => {
  e.preventDefault();
  const matkul = $('s-matkul').value.trim();
  if (!matkul && ui.jenis === 'dosen') {
    $('s-error').textContent = 'Isi nama mata kuliahnya dulu.';
    $('s-error').hidden = false;
    return;
  }
  data.jadwal[ui.sel.hari][ui.sel.i] = { matkul, jenis: ui.jenis, dosen: ui.jenis === 'dosen' ? $('s-dosen').value.trim() : '' };
  simpan();
  $('dlg-sesi').close();
  renderSemua();
});

$('s-kosongkan').addEventListener('click', () => {
  data.jadwal[ui.sel.hari][ui.sel.i] = null;
  simpan();
  $('dlg-sesi').close();
  renderSemua();
});

$('s-tugas').addEventListener('click', e => {
  const lihat = e.target.closest('[data-lihat]');
  const tambah = e.target.closest('[data-tambah]');
  if (!lihat && !tambah) return;
  $('dlg-sesi').close();
  if (lihat) { ui.view = 'tugas'; ui.filter = lihat.dataset.lihat; renderSemua(); }
  if (tambah) bukaFormTugas(null, tambah.dataset.tambah);
});

/* ---------- Atur jam sesi & hari kuliah ---------- */
const tambahMenit = (s, n) => { const t = Math.min(menit(s) + n, 23 * 60 + 59); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

function barisSesi(s, asal) {
  const div = document.createElement('div');
  div.className = 'baris-sesi';
  div.dataset.asal = asal;                 // index sesi lama ('' = sesi baru), supaya isi jadwal ikut pindah
  div.innerHTML = `<span class="no-sesi"></span>
    <input type="time" class="f j-mulai" required aria-label="Jam mulai">
    <span class="sampai">–</span>
    <input type="time" class="f j-selesai" required aria-label="Jam selesai">
    <button type="button" class="hapus-sesi" title="Hapus sesi">×</button>`;
  div.querySelector('.j-mulai').value = s.mulai;
  div.querySelector('.j-selesai').value = s.selesai;
  return div;
}
function nomoriSesi() {
  const baris = [...$('j-sesi').children];
  baris.forEach((b, i) => {
    b.querySelector('.no-sesi').textContent = `Sesi ${i + 1}`;
    b.querySelector('.hapus-sesi').setAttribute('aria-label', `Hapus sesi ${i + 1}`);
    b.querySelector('.hapus-sesi').hidden = baris.length === 1;
  });
  $('j-tambah').hidden = baris.length >= MAKS_SESI;
}
function isiFormJam(sesi, hari, pakaiAsal) {
  $('j-sesi').replaceChildren(...sesi.map((s, i) => barisSesi(s, pakaiAsal ? i : '')));
  nomoriSesi();
  $('j-hari').innerHTML = URUT_HARI.map(h =>
    `<button type="button" class="chip-hari ${hari.includes(h) ? 'on' : ''}" data-h="${h}" aria-pressed="${hari.includes(h)}">${HARI[h].slice(0, 3)}</button>`).join('');
  $('j-error').hidden = true;
}
function bukaFormJam() {
  isiFormJam(data.sesi, data.hari, true);
  $('dlg-jam').showModal();
}

document.addEventListener('click', e => {
  if (!e.target.closest('[data-atur-jadwal]')) return;
  ui.view = 'jadwal';
  renderSemua();
  bukaFormJam();
});
$('j-hari').addEventListener('click', e => {
  const b = e.target.closest('[data-h]');
  if (!b) return;
  const on = !b.classList.contains('on');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', on);
});
$('j-sesi').addEventListener('click', e => {
  const b = e.target.closest('.hapus-sesi');
  if (!b) return;
  b.closest('.baris-sesi').remove();
  nomoriSesi();
});
$('j-tambah').addEventListener('click', () => {
  const baris = [...$('j-sesi').children];
  const akhir = baris.length ? baris[baris.length - 1].querySelector('.j-selesai').value || '08:00' : '07:30';
  const mulai = tambahMenit(akhir, 30);
  $('j-sesi').appendChild(barisSesi({ mulai, selesai: tambahMenit(mulai, 90) }, ''));
  nomoriSesi();
});
$('j-awal').addEventListener('click', () => {
  // Kembali ke jam bawaan, tapi isi jadwal tetap di sesi yang sama (sesi 1 tetap sesi 1, dst.)
  const n = SESI_AWAL.length;
  isiFormJam(SESI_AWAL, HARI_AWAL, false);
  [...$('j-sesi').children].forEach((b, i) => { if (i < data.sesi.length && i < n) b.dataset.asal = i; });
});
$('j-batal').addEventListener('click', () => $('dlg-jam').close());

$('form-jam').addEventListener('submit', e => {
  e.preventDefault();
  const salah = teks => { $('j-error').textContent = teks; $('j-error').hidden = false; };
  const baris = [...$('j-sesi').children].map(b => ({
    mulai: b.querySelector('.j-mulai').value,
    selesai: b.querySelector('.j-selesai').value,
    asal: b.dataset.asal === '' ? null : Number(b.dataset.asal),
  }));
  const hari = [...$('j-hari').querySelectorAll('.on')].map(b => Number(b.dataset.h));

  if (!hari.length) return salah('Pilih minimal satu hari kuliah.');
  if (!baris.length) return salah('Tambahkan minimal satu sesi.');
  for (const [i, s] of baris.entries()) {
    if (!POLA_JAM.test(s.mulai) || !POLA_JAM.test(s.selesai)) return salah(`Jam sesi ${i + 1} belum lengkap.`);
    if (s.mulai >= s.selesai) return salah(`Sesi ${i + 1}: jam selesai harus setelah jam mulai.`);
  }
  baris.sort((x, y) => x.mulai.localeCompare(y.mulai));
  for (let i = 1; i < baris.length; i++) {
    if (baris[i].mulai < baris[i - 1].selesai) return salah(`Jam ${jam(baris[i - 1].mulai)}–${jam(baris[i - 1].selesai)} dan ${jam(baris[i].mulai)}–${jam(baris[i].selesai)} bertabrakan.`);
  }

  // Sesi lama yang dihapus tapi masih berisi mata kuliah -> tanya dulu
  const dipakai = new Set(baris.map(s => s.asal).filter(x => x !== null));
  let hilang = 0;
  for (let h = 0; h <= 6; h++) data.jadwal[h].forEach((c, i) => { if (c && !dipakai.has(i)) hilang++; });
  if (hilang && !confirm(`${hilang} kotak jadwal ada di sesi yang dihapus dan isinya akan hilang. Lanjutkan?`)) return;

  const jadwalBaru = {};
  for (let h = 0; h <= 6; h++) jadwalBaru[h] = baris.map(s => (s.asal !== null ? data.jadwal[h][s.asal] || null : null));
  data.sesi = baris.map(s => ({ mulai: s.mulai, selesai: s.selesai }));
  data.hari = URUT_HARI.filter(h => hari.includes(h));
  data.jadwal = jadwalBaru;
  hitungSesi();
  simpan();
  $('dlg-jam').close();
  renderSemua();
});

/* =========================================================
   10. BACKUP & PULIHKAN
   ========================================================= */
function backup() {
  data.terakhirBackup = Date.now();
  simpan();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tugasku-${isoTanggal(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  renderSemua();
}
document.addEventListener('click', e => { if (e.target.closest('[data-backup]')) backup(); });

$('file-pulihkan').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const isi = JSON.parse(await file.text());
    if (!isi || !Array.isArray(isi.tugas) || typeof isi.jadwal !== 'object') throw new Error('ini bukan file backup Tugasku.');
    const nUl = Array.isArray(isi.ulangan) ? isi.ulangan.length : 0;
    if (!confirm(`Ganti semua data sekarang dengan isi backup ini (${isi.tugas.length} tugas, ${nUl} ulangan)?`)) return;
    data = rapikan(isi);
    hitungSesi();
    simpan();
    ui.filter = '';
    renderSemua();
    alert('Data berhasil dipulihkan.');
  } catch (err) {
    alert('File ini tidak bisa dipulihkan: ' + err.message);
  }
});

/* =========================================================
   11. OMBAK: bentuknya gabungan 3 gelombang sinus yang berulang tiap
   1200 satuan (= 1 lebar layar), jadi saat digeser ke kiri sejauh itu
   sambungannya tidak kelihatan.
   ========================================================= */
function pathOmbak(fase) {
  let d = 'M-200 -200';
  for (let x = -200; x <= 2600; x += 20) {
    const t = 2 * Math.PI * x / 1200;
    const y = 43 + 10 * Math.sin(3 * t + fase) + 6 * Math.sin(2 * t + fase * 2.3 + 1) + 4 * Math.sin(5 * t + fase * 0.7 + 2);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return d + ' L2600 -200 Z';
}
document.querySelectorAll('.ombak').forEach(p => p.setAttribute('d', pathOmbak(Number(p.dataset.fase))));

/* =========================================================
   12. PENGHUBUNG KE cloud.js (sinkron ke akun Google, opsional)
   ========================================================= */
window.Tugasku = {
  ambil: () => data,
  adaIsi: () => data.tugas.length > 0 || data.ulangan.length > 0 || !jadwalKosong(),
  ringkas: d => {
    const r = rapikan(d);
    let sesi = 0;
    for (const h of r.hari) sesi += r.jadwal[h].filter(Boolean).length;
    return `${r.tugas.length} tugas, ${r.ulangan.length} ulangan, ${sesi} sesi jadwal`;
  },
  // Ganti data dengan versi dari cloud (tidak memicu unggah ulang)
  ganti(d) { data = rapikan(d); hitungSesi(); simpanLokal(); renderSemua(); },
  hapusLokal() { data = dataKosong(); hitungSesi(); simpanLokal(); renderSemua(); },
};

/* =========================================================
   13. MULAI
   ========================================================= */
renderSemua();
// Perbarui status "sekarang" & label deadline tiap 30 detik (kecuali sedang mengisi form)
setInterval(() => {
  if (!document.querySelector('dialog[open]')) renderSemua();
}, 30000);
