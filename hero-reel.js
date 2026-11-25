/* Hero reel: a 15-second story film that plays only while the hero is on screen.
   ---------------------------------------------------------------------------
   - Plays when at least a quarter of the hero is visible, pauses the moment it is not, and
     pauses when the tab is hidden. Nothing runs, and nothing decodes, while you read the rest.
   - Muted, inline, looping, no audio track: the only combination every browser will autoplay.
   - Follows the site language: two renders, EN and FR, swapped on `i18n:changed`.
   - Respects prefers-reduced-motion and Save-Data: those visitors get the poster frame and the
     video file is never downloaded.
   - Has a pause button, because WCAG 2.2.2 requires one for moving content longer than five
     seconds that plays alongside other content.
   - In the single-file build the video arrives as a base64 data URI. It is turned into a Blob URL
     before playback, because some browsers will not stream a multi-megabyte data: video.
*/
(function () {
  'use strict';
  var reel = document.querySelector('.reel');
  if (!reel) return;
  var video = reel.querySelector('video');
  var hero = reel.closest('section') || reel;
  var btn = hero.querySelector('.reel-ctl');   // in the film's bottom bar since v7, outside .reel

  var LABEL = {
    en: { pause: 'Pause the reel', play: 'Play the reel', scroll: 'Scroll', scrollAria: 'Scroll to the introduction',
          chapters: ['Memes', 'The lane', 'The switch', 'The work', 'Scroll'], jump: 'Jump to chapter' },
    fr: { pause: 'Mettre la vidéo en pause', play: 'Lire la vidéo', scroll: 'Défiler', scrollAria: 'Aller à l’introduction',
          chapters: ['Les mèmes', 'La place', 'Le virage', 'Le travail', 'Défiler'], jump: 'Aller au chapitre' }
  };

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && (navigator.connection.saveData ||
                 /(^|-)2g$/.test(navigator.connection.effectiveType || ''));
  var staticOnly = reduce || saveData;

  var userPaused = false;   // the visitor pressed pause: never auto-resume over that choice
  var inView = false;
  var current = '';         // language whose source is loaded
  var blobs = {};

  function lang() { return (document.documentElement.lang || 'en').indexOf('fr') === 0 ? 'fr' : 'en'; }

  function playable(src) {
    if (src.indexOf('data:') !== 0) return src;
    if (blobs[src]) return blobs[src];
    var comma = src.indexOf(',');
    var mime = src.slice(5, src.indexOf(';'));
    var bin = atob(src.slice(comma + 1));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return (blobs[src] = URL.createObjectURL(new Blob([bytes], { type: mime })));
  }

  function setLabel() {
    if (!btn) return;
    var l = LABEL[lang()];
    var playing = !video.paused;
    btn.setAttribute('aria-label', playing ? l.pause : l.play);
    btn.setAttribute('aria-pressed', playing ? 'false' : 'true');
    btn.dataset.state = playing ? 'playing' : 'paused';
  }

  function load() {
    var l = lang();
    var poster = reel.getAttribute('data-poster-' + l);
    if (poster) video.setAttribute('poster', playable(poster));
    if (staticOnly || current === l) return;
    current = l;
    video.src = playable(reel.getAttribute('data-src-' + l));
    video.load();
  }

  function sync() {
    if (staticOnly) return;
    if (inView && !userPaused && !document.hidden) {
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay refused: the poster stays */ });
    } else if (!video.paused) {
      video.pause();
    }
  }

  video.muted = true;               // set as properties too: some browsers ignore the attributes
  video.playsInline = true;
  video.addEventListener('play', setLabel);
  video.addEventListener('pause', setLabel);

  if (staticOnly) {
    reel.classList.add('is-static');
    if (btn) btn.hidden = true;
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (video.paused) { userPaused = false; sync(); }
      else { userPaused = true; video.pause(); }
    });
  }

  /* v8: chapter bar + scroll cue. The film is five shots; the bar shows where you are, fills as
     it plays (on requestAnimationFrame, since timeupdate only fires ~4 times a second), and a click
     jumps to that shot. The scroll cue takes you past the film to the introduction. */
  var nav = hero.querySelector('.chapters');
  var cue = hero.querySelector('.scroll-cue');
  var starts = nav ? nav.getAttribute('data-starts').split(',').map(Number) : [];
  var total = nav ? Number(nav.getAttribute('data-total')) : 0;
  var segs = [];
  if (nav && staticOnly) nav.hidden = true;   // a poster has no timeline to navigate
  if (nav && !staticOnly) {
    starts.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chap';
      b.innerHTML = '<span class="chap-track"><span class="chap-fill"></span></span><span class="chap-label"></span>';
      b.addEventListener('click', function () {
        video.currentTime = s + 0.05;
        paint();
        if (!userPaused) sync();
      });
      nav.appendChild(b);
      segs.push(b);
    });
  }
  function paintLabels() {
    var l = LABEL[lang()];
    segs.forEach(function (b, i) {
      b.querySelector('.chap-label').textContent = l.chapters[i];
      b.setAttribute('aria-label', l.jump + ' ' + (i + 1) + ': ' + l.chapters[i]);
    });
    if (cue) {
      cue.querySelector('.sc-label').textContent = l.scroll;
      cue.setAttribute('aria-label', l.scrollAria);
    }
  }
  function paint() {
    var t = video.currentTime || 0;
    segs.forEach(function (b, i) {
      var a = starts[i], z = i + 1 < starts.length ? starts[i + 1] : total;
      var k = Math.max(0, Math.min(1, (t - a) / (z - a)));
      b.querySelector('.chap-fill').style.transform = 'scaleX(' + k + ')';
      var on = t >= a && t < z;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
  var raf = 0;
  function loop() { paint(); raf = video.paused ? 0 : requestAnimationFrame(loop); }
  if (segs.length) {
    video.addEventListener('play', function () { if (!raf) raf = requestAnimationFrame(loop); });
    video.addEventListener('seeked', paint);
    paint();
  }
  if (cue) {
    cue.addEventListener('click', function () {
      var to = document.getElementById('intro');
      if (to) to.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  }
  paintLabels();

  load();
  setLabel();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.25 }).observe(hero);
  } else {
    inView = true;
    sync();
  }

  document.addEventListener('visibilitychange', sync);

  /* v7: while the page sits at the top, the nav is over the film's own black letterbox bar, so
     it drops its tinted background and divider line; it gets them back as soon as you scroll. */
  if (hero.classList.contains('hero-film')) {
    var top = function () { document.body.classList.toggle('film-top', window.scrollY < 8); };
    top();
    addEventListener('scroll', top, { passive: true });
  }

  addEventListener('i18n:changed', function () {
    var wasPlaying = !video.paused;
    load();
    setLabel();
    paintLabels();
    if (wasPlaying) sync();
  });
})();
