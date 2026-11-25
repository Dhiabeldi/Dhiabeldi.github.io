/* about-hero.js (19 Oct 2026, option B): the original home hero pile, on the About page.
   Real UI parts from the products tumble onto the name; drag and throw them, or push them with the cursor.
   - Static by default: the parts sit in a tidy row (CSS). Nothing moves on phones, with reduced motion, or without JS.
   - matter.js loads only when the section is on screen (desktop, motion allowed).
   - The loop stops when everything is asleep, when the section leaves the screen, or when the tab is hidden.
   Physics values follow hero-ring.js (v9.1), without the 3D ring. */
(function () {
  'use strict';
  var sec = document.getElementById('ap'), layer = document.getElementById('ap-parts');
  if (!sec || !layer || !('IntersectionObserver' in window)) return;
  var wide = window.matchMedia('(min-width: 760px)');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var SRC = 'https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js';
  var M, engine, items = [], statics = [], bounds = { W: 0, H: 0 }, grab = null, started = false, loading = false, visible = false, raf = 0, last = 0, timers = [];
  var hand = { x: -999, y: -999, px: -999, py: -999, on: false };

  function allowed() { return wide.matches && !still.matches; }
  function load(cb) {
    if (window.Matter) return cb();
    if (loading) return; loading = true;
    var s = document.createElement('script'); s.src = SRC; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = cb; s.onerror = function () { loading = false; };
    document.head.appendChild(s);
  }
  function local(e) { var r = sec.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  function buildStatics() {
    statics.forEach(function (b) { M.Composite.remove(engine.world, b); }); statics = [];
    var W = sec.clientWidth, H = sec.clientHeight, sr = sec.getBoundingClientRect();
    var o = { isStatic: true, friction: 0.8, restitution: 0.1 };
    // 200 px thick walls just outside each visible edge (floor, left, right, ceiling), so nothing leaves the section
    var T = 200;
    statics.push(M.Bodies.rectangle(W / 2, H - 8 + T / 2, W + T * 2, T, o), M.Bodies.rectangle(-T / 2, H / 2, T, H + T * 2, o),
                 M.Bodies.rectangle(W + T / 2, H / 2, T, H + T * 2, o), M.Bodies.rectangle(W / 2, -T / 2, W + T * 2, T, o));
    bounds = { W: W, H: H };
    // the name: one body per word, so parts can land on the letters
    [].forEach.call(sec.querySelectorAll('.ap-w'), function (w) {
      var r = w.getBoundingClientRect(), fs = parseFloat(getComputedStyle(w).fontSize);
      statics.push(M.Bodies.rectangle(r.left - sr.left + r.width / 2, r.top - sr.top + fs * 0.12 + (r.height - fs * 0.2) / 2, r.width - fs * 0.04, r.height - fs * 0.2,
        { isStatic: true, friction: 0.8, restitution: 0.1, chamfer: { radius: 8 } }));
    });
    // the line under the name
    var row = sec.querySelector('.ap-row').getBoundingClientRect();
    statics.push(M.Bodies.rectangle(row.left - sr.left + row.width / 2, row.top - sr.top + row.height / 2, row.width, row.height, o));
    M.Composite.add(engine.world, statics);
  }

  function start() {
    if (started || !window.Matter || !allowed()) return;
    started = true; M = window.Matter;
    engine = M.Engine.create({ gravity: { x: 0, y: 1.15 }, enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    var sr = sec.getBoundingClientRect();
    items = [].slice.call(layer.querySelectorAll('.ap-pt')).map(function (el) {
      var k = el.firstElementChild, r = el.getBoundingClientRect(), w = k.offsetWidth, h = k.offsetHeight;
      var cx = r.left - sr.left + r.width / 2, cy = r.top - sr.top + r.height / 2;
      var ang = (parseFloat(el.style.getPropertyValue('--r')) || 0) * Math.PI / 180;
      var rad = parseFloat(getComputedStyle(k).borderTopLeftRadius) || 8, circle = !!el.dataset.circle;
      var opts = { restitution: 0.32, friction: 0.45, frictionAir: 0.014, density: 0.0016 };
      var b = circle ? M.Bodies.circle(cx, cy, w / 2, opts) : M.Bodies.rectangle(cx, cy, w, h, Object.assign(opts, { chamfer: { radius: Math.min(rad, h / 2 - 1) } }));
      M.Body.setAngle(b, ang);
      M.Body.setStatic(b, true);          // held in place until release(); created dynamic first so its mass is kept
      el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.transformOrigin = (w / 2) + 'px ' + (h / 2) + 'px';
      return { el: el, b: b, w: w, h: h, home: { x: cx, y: cy, a: ang } };
    });
    sec.classList.add('live');          // parts switch to absolute positions in the same frame as their first transform
    buildStatics();
    items.forEach(function (it) { M.Composite.add(engine.world, it.b); });
    paint();
    bindInput();
    release();
  }

  // let them go one by one: a small push, then gravity does the rest
  function release() {
    timers.forEach(clearTimeout); timers = [];
    items.forEach(function (it, i) {
      timers.push(setTimeout(function () {
        M.Body.setStatic(it.b, false);
        M.Body.setVelocity(it.b, { x: (Math.random() - 0.5) * 4, y: -2 - Math.random() * 3 });
        M.Body.setAngularVelocity(it.b, (Math.random() - 0.5) * 0.12);
        wake();
      }, 200 + i * 90));
    });
    wake();
  }
  // a throw is capped, so a part can never cross a wall in one step; anything that still ends up outside is put back
  var VMAX = 22, E = 10;
  function keepIn() {
    for (var i = 0; i < items.length; i++) {
      var b = items[i].b; if (b.isStatic) continue;
      var v = b.velocity, sp = Math.hypot(v.x, v.y);
      if (sp > VMAX) M.Body.setVelocity(b, { x: v.x / sp * VMAX, y: v.y / sp * VMAX });
      var bx = b.bounds, dx = 0, dy = 0;
      // E: a small inner margin, because the rounded corners of a tilted part reach a little past its physics outline
      if (bx.min.x < E) dx = E - bx.min.x; else if (bx.max.x > bounds.W - E) dx = bounds.W - E - bx.max.x;
      if (bx.min.y < E) dy = E - bx.min.y; else if (bx.max.y > bounds.H - 8) dy = bounds.H - 8 - bx.max.y;
      if (dx || dy) {
        M.Body.translate(b, { x: dx, y: dy });
        M.Body.setVelocity(b, { x: dx ? -b.velocity.x * 0.3 : b.velocity.x, y: dy ? -b.velocity.y * 0.3 : b.velocity.y });
      }
    }
  }
  function clampPoint(p) { return { x: Math.max(4, Math.min(bounds.W - 4, p.x)), y: Math.max(4, Math.min(bounds.H - 4, p.y)) }; }

  function paint() {
    for (var i = 0; i < items.length; i++) {
      var it = items[i], p = it.b.position;
      it.el.style.transform = 'translate(' + (p.x - it.w / 2).toFixed(2) + 'px,' + (p.y - it.h / 2).toFixed(2) + 'px) rotate(' + it.b.angle.toFixed(4) + 'rad)';
    }
  }
  function pushHand() {
    if (!hand.on || grab) return;
    var vx = hand.x - hand.px, vy = hand.y - hand.py; hand.px = hand.x; hand.py = hand.y;
    if (Math.hypot(vx, vy) < 1.5) return;
    items.forEach(function (it) {
      var b = it.b; if (b.isStatic) return;
      var dx = b.position.x - hand.x, dy = b.position.y - hand.y, R = Math.max(it.w, it.h) / 2 + 46, d = Math.hypot(dx, dy) || 1;
      if (d < R) {
        var f = 1 - d / R; M.Sleeping.set(b, false);
        M.Body.setVelocity(b, { x: b.velocity.x + vx * 0.22 * f + dx / d * f * 1.2, y: b.velocity.y + Math.min(0, vy) * 0.22 * f - f * 2.2 });
        M.Body.setAngularVelocity(b, b.angularVelocity + (vx > 0 ? 1 : -1) * 0.012 * f);
      }
    });
  }
  function busy() {
    if (grab || timers.length && items.some(function (it) { return it.b.isStatic; })) return true;
    for (var i = 0; i < items.length; i++) if (!items[i].b.isSleeping && !items[i].b.isStatic) return true;
    return false;
  }
  function frame(t) {
    raf = 0;
    if (!visible || document.hidden) return;
    var ms = Math.min(t - (last || t), 20) || 16.667; last = t;
    pushHand();
    items.forEach(function (it) {
      var b = it.b; if (b.isStatic || (grab && grab.it === it)) return;
      if (Math.hypot(b.velocity.x, b.velocity.y) < 6) M.Body.setAngularVelocity(b, b.angularVelocity * 0.96 - Math.sin(b.angle) * 0.0035);
    });
    var n = Math.ceil(ms / 16.667);
    for (var k = 0; k < n; k++) { M.Engine.update(engine, ms / n); keepIn(); }
    paint();
    if (busy() || hand.on) raf = requestAnimationFrame(frame); else last = 0;
  }
  function wake() { if (!started || raf || !visible || document.hidden) return; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  function bindInput() {
    items.forEach(function (it) {
      it.el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || it.b.isStatic) return;
        e.preventDefault();
        var p = local(e); M.Sleeping.set(it.b, false);
        grab = { it: it, c: M.Constraint.create({ pointA: p, bodyB: it.b, pointB: { x: p.x - it.b.position.x, y: p.y - it.b.position.y }, stiffness: 0.18, damping: 0.12, length: 0 }) };
        M.Composite.add(engine.world, grab.c); it.el.classList.add('drag');
        try { it.el.setPointerCapture(e.pointerId); } catch (x) {}
        wake();
      });
      it.el.addEventListener('pointermove', function (e) { if (grab && grab.it === it) { grab.c.pointA = clampPoint(local(e)); M.Sleeping.set(it.b, false); } });
      var up = function () { if (grab && grab.it === it) { M.Composite.remove(engine.world, grab.c); it.el.classList.remove('drag'); grab = null; wake(); } };
      it.el.addEventListener('pointerup', up); it.el.addEventListener('pointercancel', up);
    });
    sec.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') return; var p = local(e); hand.x = p.x; hand.y = p.y; hand.on = true; wake(); });
    sec.addEventListener('pointerleave', function () { hand.on = false; });
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (started) { buildStatics(); wake(); } }, 200); });
  }

  new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    if (!visible) { stop(); return; }
    if (!allowed()) return;
    if (!started) load(start); else wake();
  }, { threshold: 0.3 }).observe(sec);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else wake(); });
})();
