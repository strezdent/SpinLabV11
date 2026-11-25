/* SpinLab - renderer (UI, roda, animasi, suara, popup, confetti) */
(function () {
  'use strict';

  var L = window.WheelLogic;
  var $ = function (id) { return document.getElementById(id); };

  var COLORS = { dark: '#005A5B', teal: '#00A896', lime: '#C4D600', gold: '#F2A516' };
  var FONT = '"PoppinsSpin","Poppins","Roboto",Arial,sans-serif';

  /* ------------------------------------------------------------------ *
   *  SKALA PANGGUNG (layout potret selebar 1080 px, tinggi menyesuaikan layar)
   * ------------------------------------------------------------------ */
  var stageScale = 1;
  var DESIGN_W = 1080, DESIGN_MIN_H = 1560;
  function fitStage() {
    var w = window.innerWidth, h = window.innerHeight;
    stageScale = Math.min(w / DESIGN_W, h / DESIGN_MIN_H);
    var root = document.documentElement.style;
    root.setProperty('--scale', String(stageScale));
    root.setProperty('--stage-h', (h / stageScale) + 'px');
  }

  /* ------------------------------------------------------------------ *
   *  AUDIO (Web Audio API, semua suara dibuat lokal)
   *  Klik pemukul plastik pada pasak dan bel kecil untuk tombol/putar.
   *  Hasil (hadiah kecil / hadiah besar / ZONK) memakai suara lembut ala marimba &
   *  kalimba + pad hangat, tanpa brass/cymbal yang tajam.
   *  Memakai noise + filter + overtone nyata (bukan nada sine polos) agar
   *  terdengar seperti benda/instrumen sungguhan, lalu diberi reverb ruang
   *  dan kompresor supaya padat dan tidak pecah.
   * ------------------------------------------------------------------ */
  var Sound = (function () {
    var ctx = null, master = null, verb = null, muted = false, noiseBuf = null;

    // Pentatonik C mayor: selalu harmonis
    var C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0,
        C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, A6 = 1760.0, C7 = 2093.0;
    var SPARKLE = [C6, D6, E6, G6, A6, C7];

    function makeImpulse(c, seconds, decay) {
      var rate = c.sampleRate, len = Math.floor(rate * seconds);
      var buf = c.createBuffer(2, len, rate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    function ensure() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
          var comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4;
          comp.attack.value = 0.004; comp.release.value = 0.25;
          comp.connect(ctx.destination);
          master = ctx.createGain();
          master.gain.value = 0.9;
          master.connect(comp);
          var conv = ctx.createConvolver();                 // reverb ruang/aula
          conv.buffer = makeImpulse(ctx, 1.8, 2.4);
          verb = ctx.createGain();
          verb.gain.value = 0.4;
          verb.connect(conv); conv.connect(master);
          var n = Math.floor(ctx.sampleRate * 2.5);          // buffer noise bersama
          noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
          var nd = noiseBuf.getChannelData(0);
          for (var i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
        } catch (e) { ctx = null; return null; }
      }
      if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
      return ctx;
    }

    function send(node, amount) {
      node.connect(master);
      if (amount) { var s = ctx.createGain(); s.gain.value = amount; node.connect(s); s.connect(verb); }
    }

    // Osilator tunggal dengan envelope (dipakai untuk bel & thump)
    function tone(o) {
      if (muted) return;
      var c = ensure(); if (!c) return;
      try {
        var t = c.currentTime + (o.start || 0);
        var dur = o.dur || 0.2, vol = o.vol || 0.2, atk = o.attack || 0.004;
        var osc = c.createOscillator(), g = c.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.freq, t);
        if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); send(g, o.verb);
        osc.start(t); osc.stop(t + dur + 0.05);
      } catch (e) { /* abaikan */ }
    }

    // Semburan noise terfilter (klik, cymbal, whoosh, tepukan)
    function noise(o) {
      if (muted) return;
      var c = ensure(); if (!c) return;
      try {
        var t = c.currentTime + (o.start || 0);
        var dur = o.dur || 0.05, vol = o.vol || 0.2, atk = o.attack || 0.002;
        var src = c.createBufferSource(); src.buffer = noiseBuf;
        var f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 0.8;
        f.frequency.setValueAtTime(o.freq || 2000, t);
        if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); send(g, o.verb);
        src.start(t, Math.random() * (noiseBuf.duration - dur - 0.1));
        src.stop(t + dur + 0.05);
      } catch (e) { /* abaikan */ }
    }

    // Bel logam: nada dasar + overtone tidak-harmonik khas bel/glockenspiel
    function bell(freq, start, vol, dur, rev) {
      dur = dur || 0.9; rev = rev == null ? 0.6 : rev;
      tone({ freq: freq,        dur: dur,        vol: vol,        start: start, attack: 0.002, verb: rev });
      tone({ freq: freq * 2.76, dur: dur * 0.45, vol: vol * 0.32, start: start, attack: 0.002, verb: rev });
      tone({ freq: freq * 5.40, dur: dur * 0.22, vol: vol * 0.14, start: start, attack: 0.002, verb: rev });
      noise({ start: start, dur: 0.012, type: 'highpass', freq: 4000, vol: vol * 0.25, verb: 0.2 });  // "ting" saat dipukul
    }

    // Brass: 3 sawtooth sedikit fals + filter yang membuka lalu menutup (suara terompet/trombon)
    function brass(freq, start, dur, vol, o) {
      if (muted) return;
      var c = ensure(); if (!c) return;
      o = o || {};
      try {
        var t = c.currentTime + start;
        var f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
        f.frequency.setValueAtTime(o.dark ? 350 : 500, t);
        f.frequency.exponentialRampToValueAtTime(o.dark ? 1100 : 2800, t + 0.07);
        f.frequency.exponentialRampToValueAtTime(o.dark ? 650 : 1500, t + Math.max(0.1, dur));
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.045));
        g.gain.setValueAtTime(vol, t + Math.max(0.06, dur - 0.1));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
        [-8, 0, 8].forEach(function (cents) {
          var osc = c.createOscillator(); osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
          osc.detune.value = cents;
          if (o.vibrato) {
            var lfo = c.createOscillator(), lg = c.createGain();
            lfo.frequency.value = 5.2; lg.gain.value = o.vibrato;
            lfo.connect(lg); lg.connect(osc.detune);
            lfo.start(t + 0.15); lfo.stop(t + dur + 0.1);
          }
          osc.connect(f); osc.start(t); osc.stop(t + dur + 0.15);
        });
        f.connect(g); send(g, o.verb == null ? 0.35 : o.verb);
      } catch (e) { /* abaikan */ }
    }

    // Tepuk tangan penonton: ratusan tepukan kecil acak, ramai di tengah
    function applause(start, dur, vol) {
      var n = Math.floor(dur * 70);
      for (var i = 0; i < n; i++) {
        var pos = Math.random() * dur;
        var env = Math.min(1, pos / (dur * 0.25), (dur - pos) / (dur * 0.5));
        if (Math.random() > env) continue;
        noise({ start: start + pos, dur: 0.03 + Math.random() * 0.04, type: 'bandpass',
                freq: 1200 + Math.random() * 3000, q: 0.7, vol: vol * (0.35 + Math.random() * 0.65),
                attack: 0.001, verb: 0.35 });
      }
    }

    // Cymbal / shimmer
    function cymbal(start, dur, vol) {
      noise({ start: start, dur: dur, type: 'highpass', freq: 5500, q: 0.5, vol: vol, attack: 0.002, verb: 0.5 });
      noise({ start: start, dur: dur * 0.6, type: 'bandpass', freq: 8000, q: 1.5, vol: vol * 0.6, attack: 0.002, verb: 0.5 });
    }

    // Marimba/kalimba lembut: nada sine hangat + overtone halus, serangan pelan
    function mallet(freq, start, vol, dur, rev) {
      dur = dur || 0.8; rev = rev == null ? 0.45 : rev;
      tone({ freq: freq,     dur: dur,        vol: vol,        start: start, attack: 0.008, verb: rev });
      tone({ freq: freq * 4, dur: dur * 0.18, vol: vol * 0.10, start: start, attack: 0.004, verb: rev });
      noise({ start: start, dur: 0.03, type: 'lowpass', freq: 900, q: 0.5, vol: vol * 0.25, attack: 0.003 });
    }

    // Pad hangat: segitiga bernada rendah, naik pelan lalu memudar
    function pad(freqs, start, dur, vol, rev) {
      freqs.forEach(function (f) {
        tone({ freq: f, type: 'triangle', dur: dur, vol: vol, start: start, attack: 0.18, verb: rev == null ? 0.5 : rev });
      });
    }

    // Pemukul plastik pada pasak: "tak" renyah + bodi rendah
    function tick(vol, pitch) {
      noise({ dur: 0.022, type: 'bandpass', freq: 2600 * pitch, q: 1.4, vol: vol * 1.2, attack: 0.0008 });
      noise({ dur: 0.012, type: 'highpass', freq: 5200, vol: vol * 0.3, attack: 0.0005 });
      tone({ freq: 190 * pitch, to: 120 * pitch, dur: 0.05, vol: vol * 0.9, attack: 0.001 });
    }

    return {
      unlock: ensure,
      isMuted: function () { return muted; },
      setMuted: function (m) { muted = !!m; },

      // gap = jarak waktu (ms) antar klik: cepat -> pelan & tipis, melambat -> keras & berat
      click: function (gap) {
        var slow = Math.max(0, Math.min(1, ((gap || 40) - 25) / 220));
        var vol = 0.16 + slow * 0.3;
        var pitch = 0.9 + Math.random() * 0.1 + slow * 0.18;
        tick(vol, pitch);
      },

      // klik tombol biasa: "ting" kecil
      button: function () {
        bell(G5, 0, 0.14, 0.5, 0.3);
        bell(C6, 0.06, 0.11, 0.5, 0.3);
      },

      // mulai putar: whoosh naik + ting
      spinStart: function () {
        noise({ dur: 0.5, type: 'bandpass', freq: 250, freqTo: 3200, q: 1.1, vol: 0.28, attack: 0.18, verb: 0.3 });
        bell(G5, 0.02, 0.13, 0.5, 0.3);
        bell(C6, 0.09, 0.11, 0.5, 0.3);
      },

      // hadiah kecil (Ganci / Stiker / Pena): tiga nada marimba naik yang ramah + nada akhir hangat
      small: function () {
        mallet(C5, 0,    0.13, 0.7);
        mallet(E5, 0.13, 0.13, 0.7);
        mallet(G5, 0.26, 0.13, 0.7);
        mallet(C6, 0.42, 0.14, 1.3, 0.55);
        pad([C5, G5], 0.4, 1.3, 0.03, 0.5);
        mallet(E6, 0.72, 0.045, 0.6, 0.6);
        mallet(G6, 0.9,  0.035, 0.6, 0.6);
      },

      // hadiah besar (Mystery Box / Tumbler): arpeggio marimba ceria + pad hangat + kilau lembut + tepuk tangan tipis
      big: function () {
        var run = [C5, E5, G5, C6, E6, G6];
        run.forEach(function (f, i) { mallet(f, i * 0.13, 0.12, 0.8); });
        // akor penutup C mayor, hangat dan penuh
        [C5, E5, G5, C6].forEach(function (f) { mallet(f, 0.95, 0.1, 1.8, 0.6); });
        pad([C5 / 2, G5 / 2, C5, E5], 0.95, 2.4, 0.032, 0.55);
        for (var i = 0; i < 8; i++) {
          mallet(SPARKLE[Math.floor(Math.random() * SPARKLE.length)], 1.2 + i * 0.18, 0.04, 0.6, 0.65);
        }
        applause(1.0, 2.4, 0.035);
      },

      // ZONK: "dop-dop-doop" turun yang lucu dan lembut (bukan sad-trombone)
      zonk: function () {
        mallet(E5, 0,    0.12, 0.55, 0.4);
        mallet(D5, 0.2,  0.12, 0.55, 0.4);
        mallet(C5, 0.4,  0.12, 0.55, 0.4);
        mallet(G4, 0.62, 0.13, 1.1,  0.45);
        tone({ freq: 392, to: 349, type: 'sine', dur: 1.0, vol: 0.05, start: 0.66, attack: 0.05, verb: 0.4 });
      }
    };
  })();

  /* ------------------------------------------------------------------ *
   *  GAMBAR RODA (Canvas)
   * ------------------------------------------------------------------ */
  var CSS = 700, C = CSS / 2;           // ukuran gambar internal (px) dan titik pusat
  var WHEEL_PX = 900;                   // ukuran roda di panggung 1080 px (kanvas diperbesar lewat CSS)
  var R_OUT = 304, R_THIN = 267, R_SECT = 262, R_LIGHT = 286, R_HUB = 64;
  var canvas = $('wheel');
  var ctx = canvas.getContext('2d');
  var K = 1;                             // kepadatan piksel
  var layers = { base: null, disc: null, over: null };

  function makeLayer() {
    var c = document.createElement('canvas');
    c.width = Math.round(CSS * K); c.height = Math.round(CSS * K);
    var g = c.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0);
    return { c: c, g: g };
  }

  function buildBase() {
    var l = makeLayer(), g = l.g;
    // bayangan + cincin luar
    g.save();
    g.shadowColor = 'rgba(0,70,70,.38)'; g.shadowBlur = 30; g.shadowOffsetY = 14;
    g.beginPath(); g.arc(C, C, R_OUT, 0, Math.PI * 2); g.fillStyle = '#00A896'; g.fill();
    g.restore();
    var gr = g.createLinearGradient(0, C - R_OUT, 0, C + R_OUT);
    gr.addColorStop(0, '#2bd8c9'); gr.addColorStop(0.5, '#00A896'); gr.addColorStop(1, '#008f84');
    g.beginPath(); g.arc(C, C, R_OUT, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    // tepi luar halus
    g.beginPath(); g.arc(C, C, R_OUT - 1.5, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
    // alur gelap di dalam cincin
    g.beginPath(); g.arc(C, C, R_THIN + 4, 0, Math.PI * 2);
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,110,102,.55)'; g.stroke();
    // latar putih di bawah juring
    g.beginPath(); g.arc(C, C, R_SECT + 1, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    return l.c;
  }

  function drawSectorText(g, text, angle, color) {
    var fs = 29, maxW = 170;
    g.font = '700 ' + fs + 'px ' + FONT;
    if ('letterSpacing' in g) g.letterSpacing = '1px';
    var w = g.measureText(text).width;
    if (w > maxW) { fs = Math.floor(fs * maxW / w); g.font = '700 ' + fs + 'px ' + FONT; }
    g.save();
    g.rotate(angle);
    var rMid = 166;
    var flip = Math.cos(angle) < 0;       // sisi kiri dibalik agar tetap mudah dibaca
    g.translate(rMid, 0);
    if (flip) g.rotate(Math.PI);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    if (color === 'lime' || color === 'gold') { g.shadowColor = 'rgba(0,85,85,.45)'; g.shadowBlur = 3; g.shadowOffsetY = 1; }
    g.fillText(text, 0, 1);
    g.restore();
  }

  function buildDisc() {
    var l = makeLayer(), g = l.g;
    var a = L.SECTOR_ANGLE * Math.PI / 180;
    g.translate(C, C);
    // juring (sektor 0 mulai tepat di arah jam 12, searah jarum jam)
    L.SECTORS.forEach(function (s, i) {
      var a0 = -Math.PI / 2 + i * a, a1 = a0 + a;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R_SECT, a0, a1); g.closePath();
      g.fillStyle = COLORS[s.color]; g.fill();
    });
    // garis pemisah putih tegas
    g.lineWidth = 3.5; g.strokeStyle = '#fff'; g.lineCap = 'butt';
    for (var i = 0; i < L.SECTOR_COUNT; i++) {
      var ang = -Math.PI / 2 + i * a;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * R_SECT, Math.sin(ang) * R_SECT); g.stroke();
    }
    // label
    L.SECTORS.forEach(function (s, i) {
      drawSectorText(g, s.label, -Math.PI / 2 + i * a + a / 2, s.color);
    });
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    return l.c;
  }

  function buildOverlay() {
    var l = makeLayer(), g = l.g;
    // garis putih tipis di tepi juring
    g.beginPath(); g.arc(C, C, R_THIN, 0, Math.PI * 2);
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke();
    // hub tengah
    g.save();
    g.shadowColor = 'rgba(0,60,60,.4)'; g.shadowBlur = 16; g.shadowOffsetY = 5;
    g.beginPath(); g.arc(C, C, R_HUB, 0, Math.PI * 2); g.fillStyle = '#cdf4ee'; g.fill();
    g.restore();
    g.beginPath(); g.arc(C, C, R_HUB - 7, 0, Math.PI * 2);
    var tg = g.createLinearGradient(0, C - R_HUB, 0, C + R_HUB);
    tg.addColorStop(0, '#2bd8c9'); tg.addColorStop(1, '#00968a');
    g.fillStyle = tg; g.fill();
    g.beginPath(); g.arc(C, C, R_HUB - 16, 0, Math.PI * 2);
    var wg = g.createRadialGradient(C - 8, C - 10, 4, C, C, R_HUB - 14);
    wg.addColorStop(0, '#ffffff'); wg.addColorStop(1, '#e3f6f3');
    g.fillStyle = wg; g.fill();
    // kilau 4 sudut (logo SpinLab)
    var sr = 31, sq = 5.5;
    var sg = g.createLinearGradient(0, C - sr, 0, C + sr);
    sg.addColorStop(0, '#14c2b1'); sg.addColorStop(1, '#00857c');
    g.beginPath();
    g.moveTo(C, C - sr);
    g.quadraticCurveTo(C + sq, C - sq, C + sr, C);
    g.quadraticCurveTo(C + sq, C + sq, C, C + sr);
    g.quadraticCurveTo(C - sq, C + sq, C - sr, C);
    g.quadraticCurveTo(C - sq, C - sq, C, C - sr);
    g.closePath();
    g.fillStyle = sg; g.strokeStyle = 'rgba(0,100,95,.55)'; g.lineWidth = 1.5;
    g.fill(); g.stroke();
    return l.c;
  }

  function buildLayers() {
    layers.base = buildBase();
    layers.disc = buildDisc();
    layers.over = buildOverlay();
  }

  function resizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    K = Math.min(3, Math.max(1, dpr * stageScale * WHEEL_PX / CSS));
    canvas.width = Math.round(CSS * K); canvas.height = Math.round(CSS * K);
    canvas.style.width = WHEEL_PX + 'px'; canvas.style.height = WHEEL_PX + 'px';
    buildLayers();
  }

  function drawLights(t, spinning) {
    for (var k = 0; k < 12; k++) {
      var ang = (-90 + k * 30) * Math.PI / 180;
      var x = C + Math.cos(ang) * R_LIGHT, y = C + Math.sin(ang) * R_LIGHT;
      var b = spinning ? 0.55 + 0.45 * Math.sin(t * 0.014 - k * 0.9)
                       : 0.72 + 0.28 * Math.sin(t * 0.0028 + k * 0.8);
      var gl = ctx.createRadialGradient(x, y, 2, x, y, 26);
      gl.addColorStop(0, 'rgba(210,255,250,' + (0.75 * b).toFixed(3) + ')');
      gl.addColorStop(1, 'rgba(210,255,250,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = (k % 2 === 0) ? 'rgba(255,255,255,' + (0.8 + 0.2 * b).toFixed(3) + ')'
                                    : 'rgba(190,255,250,' + (0.7 + 0.3 * b).toFixed(3) + ')';
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ *
   *  STATE & ANIMASI PUTARAN
   * ------------------------------------------------------------------ */
  var rotation = 0;            // derajat, akumulatif searah jarum jam
  var mode = 'idle';           // 'idle' | 'spinning' (berputar bebas) | 'stopping' (mengerem)
  var velocity = 0;            // derajat/detik saat berputar bebas
  var lastTs = 0;
  var popupOpen = false;
  var anim = null;
  var lastSector = L.sectorAtRotation(0);
  var lastTick = 0, pinAngle = 0;
  var pin = $('pin'), btnSpin = $('btn-spin');
  var btnLabel = btnSpin.querySelector('span');

  // Penghitung putaran disimpan di perangkat supaya tidak ter-reset saat aplikasi ditutup
  var STORE_KEY = 'spinlab.spinCount';
  var spinCount = 0;               // jumlah putaran yang SUDAH selesai (dihentikan pengguna)
  try { spinCount = parseInt(localStorage.getItem(STORE_KEY), 10) || 0; } catch (e) { spinCount = 0; }
  function saveCount() { try { localStorage.setItem(STORE_KEY, String(spinCount)); } catch (e) { /* abaikan */ } }

  function bezier(x1, y1, x2, y2) {
    function bx(u) { var c = 3 * x1, b = 3 * (x2 - x1) - c, a = 1 - c - b; return ((a * u + b) * u + c) * u; }
    function by(u) { var c = 3 * y1, b = 3 * (y2 - y1) - c, a = 1 - c - b; return ((a * u + b) * u + c) * u; }
    return function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      var lo = 0, hi = 1, u = t;
      for (var i = 0; i < 28; i++) { u = (lo + hi) / 2; if (bx(u) < t) lo = u; else hi = u; }
      return by(u);
    };
  }
  // akselerasi halus di awal, perlambatan panjang yang natural di akhir
  var ease = bezier(0.22, 0.0, 0.12, 1.0);

  function setSpinEnabled(on) {
    btnSpin.disabled = !on;
    btnSpin.classList.toggle('idle-pulse', on && mode === 'idle');
  }
  function setButton(label, stopStyle) {
    btnLabel.textContent = label;
    btnSpin.classList.toggle('is-stop', !!stopStyle);
    btnSpin.setAttribute('aria-label', label);
  }
  function canSpin() { return mode === 'idle' && !popupOpen; }

  // Tombol SPIN ditekan: roda berputar terus sampai pengguna menekan STOP
  function startSpin() {
    if (!canSpin()) return;           // cegah klik ganda / spin saat popup terbuka
    mode = 'spinning';
    velocity = 0;
    lastTs = 0;
    anim = null;
    setButton('STOP', true);
    setSpinEnabled(false);            // aktif lagi begitu roda sudah cukup cepat
    Sound.unlock();
    Sound.spinStart();
    lastSector = L.sectorAtRotation(rotation);
  }

  // Tombol STOP ditekan: tentukan hasil (putaran ke-N), lalu rem sampai pointer tepat di sektornya
  function stopSpin() {
    if (mode !== 'spinning' || velocity < L.SPIN_SPEED * 0.5) return;
    mode = 'stopping';
    setSpinEnabled(false);
    Sound.button();
    var spinNumber = spinCount + 1;                      // putaran ke-berapa ini
    var idx = L.pickSectorIndex(spinNumber);             // ke-100, 200, ... = Mystery Box; selain itu acak
    var jitter = (L.randomFloat() - 0.5) * 0.7 * L.SECTOR_ANGLE;  // maks +-0,35 x sudut sektor, tidak mepet garis
    var plan = L.planStop(rotation, idx, velocity, jitter);
    anim = { from: rotation, to: plan.to, start: 0, duration: plan.duration, idx: idx };
    lastSector = L.sectorAtRotation(rotation);
  }

  function finishSpin() {
    var a = anim; anim = null;
    rotation = a.to;
    velocity = 0;
    var atPointer = L.sectorAtRotation(rotation);
    if (atPointer !== a.idx) console.error('Ketidaksesuaian pointer!', atPointer, a.idx); // tidak boleh terjadi
    var prize = L.SECTORS[atPointer].prize; // hadiah dibaca dari sektor yang benar-benar ditunjuk pointer
    spinCount += 1; saveCount();
    setTimeout(function () { showResult(prize); }, 550);
  }

  function frame(ts) {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;   // detik; dibatasi agar tidak melompat
    lastTs = ts;
    if (mode === 'spinning') {
      velocity += (L.SPIN_SPEED - velocity) * Math.min(1, dt * 6);   // akselerasi halus ke kecepatan penuh
      rotation += velocity * dt;
      if (btnSpin.disabled && velocity >= L.SPIN_SPEED * 0.5) setSpinEnabled(true);  // STOP baru bisa ditekan
    } else if (mode === 'stopping' && anim) {
      if (!anim.start) anim.start = ts;
      var t = Math.min(1, (ts - anim.start) / anim.duration);
      rotation = anim.from + (anim.to - anim.from) * (1 - Math.pow(1 - t, 3));   // cubic-out
      if (t >= 1) finishSpin();
    }
    if (mode !== 'idle') {
      var s = L.sectorAtRotation(rotation);
      if (s !== lastSector) {
        lastSector = s;
        pinAngle = -17;
        var gap = ts - lastTick;
        if (gap > 32) { Sound.click(gap); lastTick = ts; }
      }
    }
    // ayunan pointer
    if (pinAngle !== 0) {
      pinAngle *= 0.84;
      if (Math.abs(pinAngle) < 0.15) pinAngle = 0;
      pin.style.transform = 'rotate(' + pinAngle.toFixed(2) + 'deg)';
    }

    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.clearRect(0, 0, CSS, CSS);
    ctx.drawImage(layers.base, 0, 0, CSS, CSS);
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(layers.disc, -C, -C, CSS, CSS);
    ctx.restore();
    ctx.drawImage(layers.over, 0, 0, CSS, CSS);
    drawLights(ts, mode !== 'idle');

    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   *  CONFETTI
   * ------------------------------------------------------------------ */
  var Confetti = (function () {
    var cv = $('confetti'), cx = cv.getContext('2d');
    var parts = [], raf = 0, W = 0, H = 0, emit = 0, running = false;
    var PAL = ['#00A896', '#C4D600', '#005A5B', '#FFFFFF', '#7fe6d8', '#e3f07a'];

    function size() {
      var d = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      cx.setTransform(d, 0, 0, d, 0, 0);
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function add(x, y, vx, vy, big) {
      parts.push({
        x: x, y: y, vx: vx, vy: vy, g: rnd(0.12, 0.22), w: rnd(7, 13) * (big ? 1.15 : 1), h: rnd(4, 8),
        rot: rnd(0, 6.28), vr: rnd(-0.25, 0.25), tilt: rnd(0, 6.28), vt: rnd(0.05, 0.2),
        c: PAL[(Math.random() * PAL.length) | 0], circle: Math.random() < 0.18
      });
    }
    function rain(n) { for (var i = 0; i < n; i++) add(rnd(0, W), rnd(-H * 0.3, H * 0.05), rnd(-1.2, 1.2), rnd(1.5, 4.5)); }
    function cannon(side) {
      for (var i = 0; i < 70; i++) {
        var ang = side === 'l' ? rnd(-1.25, -0.55) : rnd(-Math.PI + 0.55, -Math.PI + 1.25);
        var sp = rnd(13, 25);
        add(side === 'l' ? 0 : W, H * 0.92, Math.cos(ang) * sp, Math.sin(ang) * sp, true);
      }
    }
    function loop() {
      cx.clearRect(0, 0, W, H);
      if (emit > 0) { rain(5); emit--; }
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy += p.g; p.vx *= 0.992; p.vy *= 0.995;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.tilt += p.vt;
        if (p.y > H + 30) { parts.splice(i, 1); continue; }
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
        cx.fillStyle = p.c;
        var sy = Math.cos(p.tilt);
        if (p.circle) { cx.beginPath(); cx.arc(0, 0, p.h * 0.7, 0, 6.283); cx.fill(); }
        else cx.fillRect(-p.w / 2, -p.h / 2 * sy, p.w, p.h * sy);
        cx.restore();
      }
      if (parts.length || emit > 0) raf = requestAnimationFrame(loop);
      else { running = false; cx.clearRect(0, 0, W, H); }
    }
    function run() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }
    return {
      resize: size,
      light: function () { size(); rain(110); run(); },
      rich: function () {
        size(); emit = 150; cannon('l'); cannon('r');
        setTimeout(function () { if (popupOpen) { cannon('l'); cannon('r'); run(); } }, 650);
        setTimeout(function () { if (popupOpen) { cannon('l'); cannon('r'); run(); } }, 1350);
        run();
      },
      clear: function () { parts = []; emit = 0; cx.clearRect(0, 0, W, H); }
    };
  })();

  /* ------------------------------------------------------------------ *
   *  POPUP HASIL
   * ------------------------------------------------------------------ */
  var overlay = $('overlay'), card = $('card');
  var DEFS = '<defs><linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2bd8c9"/><stop offset="1" stop-color="#00968a"/></linearGradient></defs>';
  var ICONS = {
    MYSTERYBOX:
      '<svg viewBox="0 0 128 128"><rect x="20" y="58" width="88" height="58" rx="8" fill="#F2A516"/>' +
      '<rect x="14" y="42" width="100" height="22" rx="8" fill="#FFD166"/><rect x="57" y="42" width="14" height="74" fill="#fff"/>' +
      '<path d="M64 42C46 42 34 34 38 22c4-12 22-6 26 20z" fill="#005A5B"/><path d="M64 42C82 42 94 34 90 22c-4-12-22-6-26 20z" fill="#005A5B"/>' +
      '<circle cx="64" cy="42" r="7" fill="#fff"/>' +
      '<text x="38" y="102" text-anchor="middle" font-family="PoppinsSpin,Segoe UI,Arial" font-weight="700" font-size="38" fill="#fff">?</text>' +
      '<text x="90" y="102" text-anchor="middle" font-family="PoppinsSpin,Segoe UI,Arial" font-weight="700" font-size="38" fill="#fff">?</text></svg>',
    GANCI:
      '<svg viewBox="0 0 128 128"><circle cx="64" cy="24" r="16" fill="none" stroke="#005A5B" stroke-width="7"/>' +
      '<rect x="57" y="36" width="14" height="18" rx="5" fill="#C4D600"/>' +
      '<rect x="28" y="50" width="72" height="68" rx="18" fill="#00A896" stroke="#fff" stroke-width="4"/>' +
      '<circle cx="64" cy="66" r="6" fill="#fff"/>' +
      '<path d="M64 80l5.5 11 12 1.8-8.7 8.4 2 12-10.8-5.7-10.8 5.7 2-12-8.7-8.4 12-1.8z" fill="#C4D600"/></svg>',
    STIKER:
      '<svg viewBox="0 0 128 128"><rect x="16" y="16" width="96" height="96" rx="24" fill="#C4D600"/>' +
      '<circle cx="46" cy="52" r="8" fill="#005A5B"/><circle cx="82" cy="52" r="8" fill="#005A5B"/>' +
      '<path d="M40 74c12 16 36 16 48 0" fill="none" stroke="#005A5B" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M112 74V88a24 24 0 0 1-24 24H74z" fill="#00A896"/>' +
      '<path d="M112 74L74 112" stroke="#fff" stroke-width="3" opacity=".7"/></svg>',
    TUMBLER:
      '<svg viewBox="0 0 128 128"><rect x="60" y="4" width="9" height="30" rx="4" fill="#C4D600" transform="rotate(14 64 20)"/>' +
      '<path d="M34 38H94L86 112a9 9 0 0 1-9 8H51a9 9 0 0 1-9-8z" fill="#F2A516"/>' +
      '<rect x="28" y="28" width="72" height="16" rx="8" fill="#005A5B"/>' +
      '<rect x="46" y="64" width="36" height="26" rx="7" fill="#fff" opacity=".92"/>' +
      '<path d="M64 69l3.2 6.4 7 1-5 5 1.2 7-6.4-3.4-6.4 3.4 1.2-7-5-5 7-1z" fill="#F2A516"/></svg>',
    PENA:
      '<svg viewBox="0 0 128 128"><g transform="rotate(40 64 64)">' +
      '<rect x="52" y="6" width="24" height="84" rx="9" fill="#00A896"/>' +
      '<rect x="52" y="6" width="24" height="24" rx="9" fill="#C4D600"/>' +
      '<rect x="52" y="36" width="24" height="6" fill="#fff"/>' +
      '<path d="M52 90H76L64 120z" fill="#005A5B"/><path d="M59.5 106H68.5L64 120z" fill="#fff"/></g></svg>',
    ZONK:
      '<svg viewBox="0 0 128 128"><circle cx="64" cy="64" r="58" fill="#005A5B" stroke="#00A896" stroke-width="7"/>' +
      '<circle cx="44" cy="52" r="9" fill="#fff"/><circle cx="84" cy="52" r="9" fill="#fff"/>' +
      '<circle cx="46" cy="55" r="4" fill="#005A5B"/><circle cx="82" cy="55" r="4" fill="#005A5B"/>' +
      '<path d="M40 92c14-18 34-18 48 0" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M96 62c6 9 9 14 9 19a9 9 0 0 1-18 0c0-5 3-10 9-19z" fill="#7fe6d8"/></svg>'
  };
  var MESSAGES = {
    MYSTERYBOX: 'Wow! Kamu mendapatkan Mystery Box!',
    GANCI: 'Selamat! Kamu mendapatkan Ganci!',
    STIKER: 'Selamat! Kamu mendapatkan Stiker!',
    TUMBLER: 'Keren! Kamu mendapatkan Tumbler!',
    PENA: 'Selamat! Kamu mendapatkan Pena!',
    ZONK: 'Yah, belum beruntung. Coba lagi!'
  };
  var BIG = { MYSTERYBOX: true, TUMBLER: true };   // hadiah besar: konfeti meriah

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* abaikan */ } }

  function showResult(prize) {
    card.setAttribute('data-result', prize);
    card.setAttribute('data-long', L.LABELS[prize].length > 8 ? '1' : '0');
    $('result-icon').innerHTML = ICONS[prize];
    $('result-title').textContent = L.LABELS[prize];
    $('result-msg').textContent = MESSAGES[prize];
    // paksa animasi diputar ulang
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    popupOpen = true; mode = 'idle';
    overlay.classList.remove('hidden');
    if (prize === 'ZONK') { Sound.zonk(); vibrate(160); }
    else if (BIG[prize]) { Sound.big(); Confetti.rich(); vibrate([70, 50, 70, 50, 120]); }
    else { Sound.small(); Confetti.light(); vibrate([60, 40, 60]); }
  }

  function closePopup() {
    if (!popupOpen) return;
    popupOpen = false;
    overlay.classList.add('hidden');
    Confetti.clear();
    setButton('SPIN', false);
    setSpinEnabled(true);
  }

  /* ------------------------------------------------------------------ *
   *  TOMBOL
   * ------------------------------------------------------------------ */
  var btnSound = $('btn-sound');
  function updateSoundIcon() {
    var m = Sound.isMuted();
    btnSound.querySelector('.snd-on').style.display = m ? 'none' : '';
    btnSound.querySelector('.snd-off').style.display = m ? '' : 'none';
    btnSound.title = m ? 'Suara OFF (ketuk untuk ON)' : 'Suara ON (ketuk untuk OFF)';
  }
  btnSound.addEventListener('click', function () {
    Sound.setMuted(!Sound.isMuted());
    updateSoundIcon();
    if (!Sound.isMuted()) { Sound.unlock(); Sound.button(); }
  });

  btnSpin.addEventListener('click', function () {
    if (mode === 'spinning') stopSpin(); else startSpin();
  });
  $('btn-again').addEventListener('click', function () {
    if (!popupOpen) return;
    closePopup();
    startSpin();                         // SPIN LAGI: langsung putaran baru
  });
  $('btn-close').addEventListener('click', function () { Sound.button(); closePopup(); });

  window.addEventListener('resize', function () {
    fitStage();
    clearTimeout(resizeCanvas._t);
    resizeCanvas._t = setTimeout(function () { resizeCanvas(); Confetti.resize(); }, 120);
  });
  window.addEventListener('orientationchange', function () { setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 200); });

  /* ------------------------------------------------------------------ *
   *  INISIALISASI
   * ------------------------------------------------------------------ */
  fitStage();
  resizeCanvas();
  Confetti.resize();
  updateSoundIcon();
  setSpinEnabled(true);
  // bangun ulang setelah font lokal siap supaya teks juring memakai Poppins
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 29px PoppinsSpin'), document.fonts.load('italic 700 100px PoppinsSpin')])
      .then(function () { buildLayers(); }).catch(function () {});
  }
  requestAnimationFrame(frame);

  // hook kecil untuk pengujian otomatis
  window.__spinLabState = function () {
    return { mode: mode, spinCount: spinCount, popupOpen: popupOpen, rotation: rotation, sector: L.sectorAtRotation(rotation), disabled: btnSpin.disabled };
  };
})();
