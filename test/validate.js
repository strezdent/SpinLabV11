/* Pengujian logika roda SpinLab. Jalankan: npm test  (atau: node test/validate.js) */
'use strict';
const L = require('../www/wheel-logic.js');
let failed = 0;
function check(name, ok, info) {
  console.log((ok ? '  [OK]   ' : '  [GAGAL] ') + name + (info ? '  -> ' + info : ''));
  if (!ok) failed++;
}
const EXPECT = { MYSTERYBOX: 1, GANCI: 3, STIKER: 4, TUMBLER: 1, PENA: 2, ZONK: 2 };

console.log('1. Struktur roda');
const cnt = L.prizeCounts();
check('13 hadiah: Mystery Box 1, Ganci 3, Stiker 4, Tumbler 1, Pena 2, Zonk 2',
  L.SECTORS.length === 13 && Object.keys(EXPECT).every(k => cnt[k] === EXPECT[k]), JSON.stringify(cnt));
let adjC = 0, adjP = 0;
for (let i = 0; i < 13; i++) {
  const n = L.SECTORS[(i + 1) % 13];
  if (L.SECTORS[i].color === n.color) adjC++;
  if (L.SECTORS[i].prize === n.prize) adjP++;
}
check('Tidak ada warna sama / hadiah sama berdampingan', adjC === 0 && adjP === 0);
const colorsOf = k => [...new Set(L.SECTORS.filter(s => s.prize === k).map(s => s.color))];
const own = { MYSTERYBOX: 'gold', ZONK: 'dark' };
check('Mystery Box (gold) & Zonk (dark) punya warna khusus',
  Object.keys(own).every(k => colorsOf(k).length === 1 && colorsOf(k)[0] === own[k]));
check('Warna khusus tidak dipakai hadiah lain; Ganci/Pena/Stiker/Tumbler hanya teal/lime',
  L.SECTORS.filter(s => !own[s.prize]).every(s => s.color === 'teal' || s.color === 'lime'));
check('Ganci, Pena, dan Stiker memang bercampur warna (teal & lime)',
  ['GANCI', 'PENA', 'STIKER'].every(k => colorsOf(k).length === 2));

console.log('2. Rejection sampling (tanpa modulo bias)');
const limit12 = 4294967296 - (4294967296 % 12);
let calls = 0; const fake = [limit12, limit12 + 1, 4294967295, 25];
const r = L.randomInt(12, () => fake[calls++]);
check('Nilai di zona bias ditolak', calls === 4 && r === 1, 'pemanggilan=' + calls);

console.log('3. Mystery Box hanya pada putaran kelipatan 100');
const MI = L.MYSTERY_INDEX;
check('Sektor Mystery Box ditemukan', L.SECTORS[MI].prize === 'MYSTERYBOX');
let early = 0, missed = 0, wrongOther = 0;
const N = 2000000, per = new Array(13).fill(0);
for (let n = 1; n <= N; n++) {
  const k = L.pickSectorIndex(n);
  const isMys = L.SECTORS[k].prize === 'MYSTERYBOX';
  if (n % 100 === 0) { if (!isMys) missed++; }
  else { if (isMys) early++; per[k]++; }
}
check('Putaran 1-99 (dan semua non-kelipatan 100) tidak pernah Mystery Box', early === 0, 'bocor=' + early);
check('Putaran 100, 200, 300, ... selalu Mystery Box', missed === 0, 'terlewat=' + missed);
check('Putaran ke-0/negatif tidak dianggap jatah Mystery Box', !L.isMysterySpin(0) && !L.isMysterySpin(-100));

console.log('4. Putaran biasa: 12 hadiah lain acak seragam');
let chi = 0; const normal = N - N / 100;
for (let i = 0; i < 13; i++) { if (i === MI) continue; const e = normal / 12; chi += (per[i] - e) * (per[i] - e) / e; }
check('Chi-square 12 sektor (df=11, kritis 31.26)', chi < 31.26, 'chi2=' + chi.toFixed(2));
const byPrize = {};
for (let i = 0; i < 13; i++) { if (i === MI) continue; const p = L.SECTORS[i].prize; byPrize[p] = (byPrize[p] || 0) + per[i]; }
Object.keys(EXPECT).filter(k => k !== 'MYSTERYBOX').forEach(k => {
  const p = EXPECT[k] / 12, got = byPrize[k] / normal, sd = Math.sqrt(p * (1 - p) / normal);
  check(k + ' ~ ' + (p * 100).toFixed(2) + '% (di luar jatah Mystery Box)', Math.abs(got - p) < 5 * sd, (got * 100).toFixed(3) + '%');
});
let prev = L.pickSectorIndex(1), same = 0, sum = 0, sum2 = 0, sxy = 0; const M = 500000;
for (let i = 0; i < M; i++) { const x = L.pickSectorIndex(1 + (i % 99)); if (x === prev) same++; sum += x; sum2 += x * x; sxy += x * prev; prev = x; }
const mean = sum / M, v = sum2 / M - mean * mean;
check('Korelasi serial lag-1 mendekati 0', Math.abs((sxy / M - mean * mean) / v) < 0.01);
check('Peluang sektor sama berturut-turut ~ 1/12', Math.abs(same / M - 1 / 12) < 0.004, (same / M * 100).toFixed(3) + '%');

console.log('5. STOP oleh pengguna: pointer berhenti tepat di sektor hasil');
let bad = 0, slow = 0, rot = 0; const A = L.SECTOR_ANGLE;
for (let i = 1; i <= 200000; i++) {
  const idx = L.pickSectorIndex(i);
  const vel = L.SPIN_SPEED * (0.5 + 0.5 * L.randomFloat());      // kecepatan saat STOP ditekan
  rot += L.randomFloat() * 100000;                                // posisi acak saat STOP ditekan
  const plan = L.planStop(rot, idx, vel, (L.randomFloat() - 0.5) * 0.7 * A);
  if (L.sectorAtRotation(plan.to) !== idx || !(plan.to > rot + 359)) bad++;
  if (plan.duration < 2500 || plan.duration > 6000) slow++;
}
check('Pointer menunjuk sektor hasil pada 200000 penghentian', bad === 0, 'selisih: ' + bad);
check('Lama pengereman wajar (2,5 - 6 detik)', slow === 0, 'di luar batas: ' + slow);

console.log(failed === 0 ? '\nSEMUA PENGUJIAN LULUS' : '\n' + failed + ' PENGUJIAN GAGAL');
process.exit(failed === 0 ? 0 : 1);
