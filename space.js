/* Ambient space background — drifting + twinkling stars with a few warm embers,
   plus occasional meteors.
   Self-contained: injects its own fixed canvas behind the page. Respects reduced-motion,
   pauses when the tab is hidden, caps DPR at 2.

   Meteors: a small streak every 8-15s, and one big slow glowing meteor every 1-3 min.
   Set BIG_METEOR to false below to keep only the small ones. */
(function () {
  var BIG_METEOR = true;

  /* accent comes from the CSS theme, so a palette swap carries the background with it */
  function cssTok(n, fb) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return v || fb;
    } catch (e) { return fb; }
  }
  function lighten(rgbStr, amt) {
    var p = rgbStr.split(',').map(Number);
    return p.map(function (c) { return Math.round(c + (255 - c) * amt); }).join(',');
  }
  var ACC = cssTok('--a-rgb', '255,106,44');
  var ACC2 = cssTok('--a2-rgb', '255,138,60');
  var ACC_HOT = lighten(ACC2, 0.80);
  var ACC_WARM = lighten(ACC2, 0.35);
  addEventListener('theme:changed', function () {
    ACC = cssTok('--a-rgb', '255,106,44');
    ACC2 = cssTok('--a2-rgb', '255,138,60');
    ACC_HOT = lighten(ACC2, 0.80);
    ACC_WARM = lighten(ACC2, 0.35);
  });


  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block';
  (document.body || document.documentElement).appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var w, h, dpr, stars, embers, meteors = [], raf, resizeT;
  function rand(a, b) { return a + Math.random() * (b - a); }

  function init() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';

    var count = Math.round((innerWidth * innerHeight) / 8500);
    count = Math.max(70, Math.min(170, count));
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: rand(0.4, 1.6) * dpr, o: rand(0.15, 0.9),
        tw: rand(0.4, 1.6), ph: Math.random() * 6.283,
        vx: rand(-0.02, 0.02) * dpr, vy: rand(0.015, 0.075) * dpr,
        warm: Math.random() < 0.14
      });
    }
    var ec = Math.max(5, Math.round(innerWidth / 240));
    embers = [];
    for (var j = 0; j < ec; j++) {
      embers.push({
        x: Math.random() * w, y: Math.random() * h,
        r: rand(1, 2.6) * dpr, o: rand(0.05, 0.22),
        vy: rand(-0.22, -0.05) * dpr, vx: rand(-0.05, 0.05) * dpr,
        ph: Math.random() * 6.283, tw: rand(0.3, 0.8)
      });
    }
  }

  /* ---------- meteors ---------- */
  function spawnMeteor(big) {
    var fromLeft = Math.random() < 0.5;
    if (big) {
      meteors.push({ big: 1, x: fromLeft ? -140 * dpr : w + 140 * dpr, y: rand(-h * 0.1, h * 0.3),
        vx: (fromLeft ? 1 : -1) * rand(3.6, 5.2) * dpr, vy: rand(1.9, 2.8) * dpr,
        life: 1, decay: 0.0026, len: rand(380, 560) * dpr, lw: 5.2 * dpr, head: 5 * dpr });
    } else {
      meteors.push({ big: 0, x: fromLeft ? -60 * dpr : w + 60 * dpr, y: rand(0, h * 0.5),
        vx: (fromLeft ? 1 : -1) * rand(7, 12) * dpr, vy: rand(3, 5) * dpr,
        life: 1, decay: 0.006, len: rand(90, 190) * dpr, lw: 2.1 * dpr, head: 1.8 * dpr });
    }
  }
  var nextMeteor = performance.now() + rand(4000, 9000);
  var nextBig = performance.now() + rand(60000, 180000);

  function drawMeteors(ts) {
    if (ts > nextMeteor) { spawnMeteor(0); nextMeteor = ts + rand(8000, 15000); }
    if (BIG_METEOR && ts > nextBig) { spawnMeteor(1); nextBig = ts + rand(60000, 180000); }
    if (!meteors.length) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var m = meteors.length - 1; m >= 0; m--) {
      var e = meteors[m];
      e.x += e.vx; e.y += e.vy; e.life -= e.decay;
      if (e.life <= 0 || e.x < -700 * dpr || e.x > w + 700 * dpr || e.y > h + 400 * dpr) {
        meteors.splice(m, 1); continue;
      }
      var fade = e.big ? Math.min(1, e.life * 2.2) : e.life;   /* big one holds brightness longer */
      var ang = Math.atan2(e.vy, e.vx);
      var gx = e.x - Math.cos(ang) * e.len, gy = e.y - Math.sin(ang) * e.len;

      if (e.big) {                                             /* soft halo around the trail */
        var hx = e.x - Math.cos(ang) * e.len * 0.32, hy = e.y - Math.sin(ang) * e.len * 0.32;
        var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, e.len * 0.42);
        hg.addColorStop(0, 'rgba(' + ACC + ',' + (0.16 * fade) + ')');
        hg.addColorStop(1, 'rgba(' + ACC + ',0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, e.len * 0.42, 0, 6.283); ctx.fill();
      }

      var mg = ctx.createLinearGradient(e.x, e.y, gx, gy);
      mg.addColorStop(0, 'rgba(' + ACC_WARM + ',' + (0.95 * fade) + ')');
      mg.addColorStop(0.35, 'rgba(' + ACC2 + ',' + ((e.big ? 0.6 : 0.45) * fade) + ')');
      mg.addColorStop(1, 'rgba(' + ACC + ',0)');
      ctx.strokeStyle = mg; ctx.lineWidth = e.lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(gx, gy); ctx.stroke();

      if (e.big) {                                             /* glowing head */
        var cg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.head * 4.5);
        cg.addColorStop(0, 'rgba(' + ACC_HOT + ',' + (0.95 * fade) + ')');
        cg.addColorStop(0.28, 'rgba(' + ACC_WARM + ',' + (0.55 * fade) + ')');
        cg.addColorStop(1, 'rgba(' + ACC + ',0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.head * 4.5, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = 'rgba(' + ACC_HOT + ',' + (0.95 * fade) + ')';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.head, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- loop ---------- */
  function frame(ts) {
    var t = ts / 1000;
    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (!reduce) { s.x += s.vx; s.y += s.vy; }
      if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
      if (s.x > w + 2) s.x = -2; else if (s.x < -2) s.x = w + 2;
      var o = reduce ? s.o : s.o * (0.55 + 0.45 * Math.sin(s.ph + t * s.tw));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fillStyle = s.warm ? 'rgba(' + ACC2 + ',' + o + ')' : 'rgba(222,236,246,' + o + ')';
      ctx.fill();
    }

    for (var j = 0; j < embers.length; j++) {
      var e = embers[j];
      if (!reduce) { e.x += e.vx; e.y += e.vy; }
      if (e.y < -6) { e.y = h + 6; e.x = Math.random() * w; }
      var eo = reduce ? e.o : e.o * (0.6 + 0.4 * Math.sin(e.ph + t * e.tw));
      var g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6);
      g.addColorStop(0, 'rgba(' + ACC + ',' + eo + ')');
      g.addColorStop(1, 'rgba(' + ACC + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 6, 0, 6.283);
      ctx.fill();
    }

    if (!reduce) drawMeteors(ts);

    if (!reduce) raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduce) frame(0); else raf = requestAnimationFrame(frame);
  }

  addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { init(); start(); }, 200);
  });
  /* pause when tab hidden (saves CPU/battery) */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) cancelAnimationFrame(raf); else if (!reduce) start();
  });

  init();
  start();
})();

/* ---------- mobile nav toggle (every page loads this file) ---------- */
(function () {
  var b = document.querySelector('.burger');
  var n = document.getElementById('navlinks');
  if (!b || !n) return;
  function set(open) {
    n.classList.toggle('open', open);
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  b.addEventListener('click', function () {
    set(b.getAttribute('aria-expanded') !== 'true');
  });
  n.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') set(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') set(false);
  });
})();
