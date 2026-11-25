/*
 * SpinLab - logika roda (dipakai oleh renderer dan skrip pengujian)
 *
 * Konvensi sudut:
 *  - Sektor ke-i menempati rentang [i*A, (i+1)*A) derajat, searah jarum jam
 *    dihitung dari arah jam 12 saat rotasi roda = 0. A = 360 / jumlah sektor.
 *  - Roda diputar searah jarum jam sebesar R derajat. Pointer tetap di arah jam 12.
 *  - Sektor di bawah pointer = floor( ((-R) mod 360) / A ).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WheelLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Susunan 13 sektor: Mystery Box 1, Ganci 3, Stiker 4, Tumbler 1, Pena 2, Zonk 2.
  // Format: [kunci hadiah, warna].
  //  - Mystery Box = 'gold' (kuning keemasan), Zonk = 'dark' (warna khusus, tidak dipakai hadiah lain)
  //  - Ganci / Pena / Stiker / Tumbler = 'teal' atau 'lime'
  // Dua sektor bersebelahan tidak pernah sama hadiah maupun sama warna (termasuk 12 -> 0).
  var LAYOUT = [
    ['STIKER',      'teal'],    // 0
    ['GANCI',       'lime'],    // 1
    ['PENA',        'teal'],    // 2
    ['STIKER',      'lime'],    // 3
    ['ZONK',        'dark'],    // 4
    ['GANCI',       'teal'],    // 5
    ['TUMBLER',     'lime'],    // 6
    ['STIKER',      'teal'],    // 7
    ['PENA',        'lime'],    // 8
    ['GANCI',       'teal'],    // 9
    ['ZONK',        'dark'],    // 10
    ['STIKER',      'lime'],    // 11
    ['MYSTERYBOX',  'gold']   // 12
  ];

  // Nama yang tampil di roda & popup
  var LABELS = {
    MYSTERYBOX: 'MYSTERY BOX',
    GANCI: 'GANCI',
    STIKER: 'STIKER',
    TUMBLER: 'TUMBLER',
    PENA: 'PENA',
    ZONK: 'ZONK'
  };

  var SECTOR_COUNT = LAYOUT.length;
  var SECTOR_ANGLE = 360 / SECTOR_COUNT; // sektor sama besar

  var SECTORS = LAYOUT.map(function (s, i) {
    return { index: i, prize: s[0], label: LABELS[s[0]], color: s[1], start: i * SECTOR_ANGLE, end: (i + 1) * SECTOR_ANGLE };
  });

  function getCrypto() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || (typeof self !== 'undefined' && self.crypto);
    if (!c || typeof c.getRandomValues !== 'function') {
      throw new Error('crypto.getRandomValues tidak tersedia');
    }
    return c;
  }

  var _buf = new Uint32Array(1);
  function randomUint32() {
    getCrypto().getRandomValues(_buf);
    return _buf[0];
  }

  /**
   * Bilangan bulat acak seragam 0..max-1 memakai crypto.getRandomValues
   * dengan rejection sampling (tanpa modulo bias).
   * `source` opsional (untuk pengujian) : fungsi yang mengembalikan uint32.
   */
  function randomInt(max, source) {
    if (!(max >= 1 && max <= 4294967296) || Math.floor(max) !== max) throw new RangeError('max tidak valid');
    var next = source || randomUint32;
    var range = 4294967296;
    var limit = range - (range % max); // kelipatan max terbesar <= 2^32
    var x;
    do { x = next(); } while (x >= limit); // tolak nilai di zona bias
    return x % max;
  }

  /** Float acak [0,1) dari 53 bit crypto (dipakai hanya untuk jitter posisi berhenti). */
  function randomFloat() {
    var hi = randomUint32() >>> 5; // 27 bit
    var lo = randomUint32() >>> 6; // 26 bit
    return (hi * 67108864 + lo) / 9007199254740992;
  }

  // Mystery Box hanya keluar pada putaran ke-100, ke-200, ke-300, dst.
  var MYSTERY_INTERVAL = 100;
  var MYSTERY_INDEX = -1;
  SECTORS.forEach(function (s) { if (s.prize === 'MYSTERYBOX') MYSTERY_INDEX = s.index; });
  // Sektor selain Mystery Box (dipakai untuk putaran biasa)
  var NORMAL_INDEXES = SECTORS.filter(function (s) { return s.prize !== 'MYSTERYBOX'; })
                              .map(function (s) { return s.index; });

  /** Apakah putaran ke-`spinNumber` (mulai dari 1) adalah jatah Mystery Box? */
  function isMysterySpin(spinNumber) {
    return spinNumber >= MYSTERY_INTERVAL && spinNumber % MYSTERY_INTERVAL === 0;
  }

  /**
   * Pilih sektor hasil untuk putaran ke-`spinNumber` (mulai dari 1).
   *  - Putaran kelipatan 100 (100, 200, ...) -> pasti Mystery Box.
   *  - Putaran lainnya -> acak seragam di antara 12 sektor lain (Mystery Box TIDAK mungkin keluar).
   * `source` opsional (untuk pengujian) : fungsi yang mengembalikan uint32.
   */
  function pickSectorIndex(spinNumber, source) {
    if (isMysterySpin(spinNumber)) return MYSTERY_INDEX;
    return NORMAL_INDEXES[randomInt(NORMAL_INDEXES.length, source)];
  }

  function mod360(x) { return ((x % 360) + 360) % 360; }

  /** Sektor yang ditunjuk pointer (arah jam 12) pada rotasi roda R derajat. */
  function sectorAtRotation(R) {
    return Math.floor(mod360(-R) / SECTOR_ANGLE) % SECTOR_COUNT;
  }

  /**
   * Hitung rotasi akhir (derajat, akumulatif, selalu searah jarum jam) sehingga
   * pointer berhenti di dalam sektor `index`, dengan offset `jitter` derajat dari
   * tengah sektor (|jitter| harus < A/2; disarankan <= 0.35*A supaya tidak mepet garis).
   */
  function computeFinalRotation(current, index, fullTurns, jitter) {
    var center = index * SECTOR_ANGLE + SECTOR_ANGLE / 2 + (jitter || 0);
    var targetMod = mod360(-center);
    var delta = mod360(targetMod - mod360(current));
    return current + fullTurns * 360 + delta;
  }

  // Kecepatan putar bebas (derajat/detik) dan lama pengereman yang dituju (detik)
  var SPIN_SPEED = 720;
  var STOP_TARGET_SEC = 4.2;

  /**
   * Rencana pengereman saat pengguna menekan STOP.
   * Roda sedang berputar dengan kecepatan `velocity` (derajat/detik) pada rotasi `current`.
   * Dikembalikan rotasi akhir `to` (searah jarum jam, pointer tepat di sektor `index`) dan
   * `duration` (ms). Kurva perlambatan cubic-out 1-(1-t)^3 punya kecepatan awal 3*D/T,
   * sehingga T = 3*D/velocity membuat transisi dari putaran bebas ke pengereman mulus.
   */
  function planStop(current, index, velocity, jitter) {
    var v = Math.max(velocity, 60);
    var delta = computeFinalRotation(current, index, 0, jitter) - current;   // 0..360
    var wanted = v * STOP_TARGET_SEC / 3;
    var turns = Math.max(1, Math.round((wanted - delta) / 360));
    var dist = delta + turns * 360;
    var sec = Math.min(6, Math.max(2.5, 3 * dist / v));
    return { to: current + dist, duration: sec * 1000, distance: dist };
  }

  /** Jumlah sektor per hadiah. */
  function prizeCounts() {
    var c = {};
    SECTORS.forEach(function (s) { c[s.prize] = (c[s.prize] || 0) + 1; });
    return c;
  }

  return {
    SECTOR_COUNT: SECTOR_COUNT,
    SECTOR_ANGLE: SECTOR_ANGLE,
    SECTORS: SECTORS,
    LABELS: LABELS,
    randomUint32: randomUint32,
    randomInt: randomInt,
    randomFloat: randomFloat,
    pickSectorIndex: pickSectorIndex,
    isMysterySpin: isMysterySpin,
    MYSTERY_INTERVAL: MYSTERY_INTERVAL,
    MYSTERY_INDEX: MYSTERY_INDEX,
    SPIN_SPEED: SPIN_SPEED,
    planStop: planStop,
    sectorAtRotation: sectorAtRotation,
    computeFinalRotation: computeFinalRotation,
    prizeCounts: prizeCounts,
    mod360: mod360
  };
});
