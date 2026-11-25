/* hero-lite.js (19 Oct 2026): the light hero. A small, calm version of the old physics pile (hero-ring.js).
   - The pieces start as a static pile placed by CSS, so there is no layout shift and nothing moves without JS.
   - matter.js is loaded only when the box is on screen, on wide screens, and only if the visitor allows motion.
   - On start the pieces hop once and settle; after that they move only when someone drags one.
   - The loop stops when everything is asleep, when the box leaves the screen, or when the tab is hidden. */
(function () {
  'use strict';
  var fig = document.getElementById('hl'), box = document.getElementById('hl-box');
  if (!fig || !box || !('IntersectionObserver' in window)) return;
  var wide = window.matchMedia('(min-width: 960px)');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var SRC = 'https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js';
  var loading = false, started = false, visible = false, raf = 0, last = 0;
  var M, engine, items = [], grab = null;

  function allowed() { return wide.matches && !still.matches; }

  function load(cb) {
    if (window.Matter) return cb();
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = SRC; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = cb;
    s.onerror = function () { loading = false; };   // stays a static pile
    document.head.appendChild(s);
  }

  function start() {
    if (started || !window.Matter || !allowed()) return;
    started = true;
    M = window.Matter;
    var W = box.clientWidth, H = box.clientHeight;
    engine = M.Engine.create({ gravity: { x: 0, y: 1 }, enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    var o = { isStatic: true, friction: 0.8, restitution: 0.1 };
    M.Composite.add(engine.world, [
      M.Bodies.rectangle(W / 2, H + 40, W * 3, 80, o),          // floor
      M.Bodies.rectangle(-40, H / 2, 80, H * 4, o),             // left wall
      M.Bodies.rectangle(W + 40, H / 2, 80, H * 4, o),          // right wall
      M.Bodies.rectangle(W / 2, -140, W * 3, 80, o)             // a lid above the box, so a throw always comes back
    ]);
    var bx = box.getBoundingClientRect();
    items = [].slice.call(box.querySelectorAll('.hl-p')).map(function (el) {
      var r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var cx = r.left - bx.left + r.width / 2, cy = r.top - bx.top + r.height / 2;
      var ang = (parseFloat(getComputedStyle(el).getPropertyValue('--r')) || 0) * Math.PI / 180;
      var b = M.Bodies.rectangle(cx, cy, w, h, { chamfer: { radius: Math.min(10, h / 2 - 1) }, restitution: 0.25, friction: 0.5, frictionAir: 0.02, density: 0.0016 });
      M.Body.setAngle(b, ang);
      M.Body.setInertia(b, b.inertia * 3);        // calmer: pieces turn less easily
      M.Composite.add(engine.world, b);
      el.style.transformOrigin = (w / 2) + 'px ' + (h / 2) + 'px';
      return { el: el, b: b, w: w, h: h };
    });
    fig.classList.add('live');      // same frame as the first transforms below, so nothing jumps
    paint();
    bindDrag();
    // one gentle hop, staggered, then they settle
    items.forEach(function (it, i) {
      setTimeout(function () {
        M.Sleeping.set(it.b, false);
        M.Body.setVelocity(it.b, { x: (Math.random() - 0.5) * 2.4, y: -4 - Math.random() * 2.5 });
        M.Body.setAngularVelocity(it.b, (Math.random() - 0.5) * 0.06);
        wake();
      }, 250 + i * 90);
    });
    wake();
  }

  function paint() {
    for (var i = 0; i < items.length; i++) {
      var it = items[i], p = it.b.position;
      it.el.style.transform = 'translate(' + (p.x - it.w / 2).toFixed(2) + 'px,' + (p.y - it.h / 2).toFixed(2) + 'px) rotate(' + it.b.angle.toFixed(4) + 'rad)';
    }
  }

  function asleep() {
    if (grab) return false;
    for (var i = 0; i < items.length; i++) if (!items[i].b.isSleeping) return false;
    return true;
  }

  function frame(t) {
    raf = 0;
    if (!visible || document.hidden) return;
    var ms = Math.min(t - (last || t), 20) || 16.667; last = t;
    // keep the pieces from ending upside down: a small pull back towards level
    items.forEach(function (it) {
      if (grab && grab.it === it) return;
      var b = it.b;
      if (!b.isSleeping && Math.hypot(b.velocity.x, b.velocity.y) < 6) M.Body.setAngularVelocity(b, b.angularVelocity * 0.9 - Math.sin(b.angle) * 0.007);
    });
    var n = Math.ceil(ms / 16.667);
    for (var k = 0; k < n; k++) M.Engine.update(engine, ms / n);
    paint();
    if (!asleep()) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function wake() {
    if (!started || raf || !visible || document.hidden) return;
    last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  function local(e) { var r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function release() {
    if (!grab) return;
    M.Composite.remove(engine.world, grab.c); grab.it.el.classList.remove('drag'); grab = null; wake();
  }
  function bindDrag() {
    items.forEach(function (it) {
      it.el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var p = local(e);
        M.Sleeping.set(it.b, false);
        grab = { it: it, c: M.Constraint.create({ pointA: p, bodyB: it.b, pointB: { x: p.x - it.b.position.x, y: p.y - it.b.position.y }, stiffness: 0.18, damping: 0.12, length: 0 }) };
        M.Composite.add(engine.world, grab.c);
        it.el.classList.add('drag');
        try { it.el.setPointerCapture(e.pointerId); } catch (x) {}
        wake();
      });
      it.el.addEventListener('pointermove', function (e) { if (grab && grab.it === it) { grab.c.pointA = local(e); M.Sleeping.set(it.b, false); } });
      it.el.addEventListener('pointerup', release);
      it.el.addEventListener('pointercancel', release);
    });
  }

  new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    if (!visible) { stop(); return; }
    if (!allowed()) return;
    if (!started) load(start); else wake();
  }, { threshold: 0.15 }).observe(box);

  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else wake(); });
})();
