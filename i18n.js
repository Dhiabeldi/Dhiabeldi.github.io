/* Bilingual portfolio: English and French from one set of pages.
   ---------------------------------------------------------------------------
   Why a runtime dictionary and not a second set of -fr.html pages:
     - the deliverable is ONE self-contained HTML file, and duplicating every
       page would double it;
     - one source of truth, so a content fix cannot land in EN and be forgotten
       in FR;
     - the reader switches language without a reload or a network request.

   Why keys are content hashes and not hand-written ids:
     - nothing has to be marked up in the HTML, so the pages stay clean;
     - a key follows its sentence around the page, so reordering sections never
       misaligns a translation;
     - when English text is edited its hash changes, the French entry is simply
       missing, and the page falls back to English rather than showing a stale
       translation. `node tools/i18n-extract.mjs` then reports exactly what to
       re-translate.

   The dictionary lives in i18n-fr.js as a plain object on window, NOT as JSON
   fetched at runtime: the portfolio is opened from disk (file://), where fetch
   is blocked by CORS. */
(function () {
  'use strict';

  var STORE = 'portfolio-lang';
  var INLINE = { B:1, I:1, EM:1, STRONG:1, SPAN:1, BR:1, SMALL:1, SUP:1, SUB:1, CODE:1, U:1 };
  var SKIP   = { SCRIPT:1, STYLE:1, NOSCRIPT:1, CANVAS:1, SVG:1, PATH:1 };

  /* FNV-1a, 32-bit. Deterministic, dependency-free, and identical here and in
     the extractor, which runs this very file in a headless browser. */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function hasLetters(s) { return /[A-Za-zÀ-ÿ]{2}/.test(s); }

  /* An element is translatable when it holds real text and every element inside
     it is inline formatting. That makes it the smallest block that owns a whole
     sentence, so the French keeps its <b> emphasis in the right places. */
  function ownText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && hasLetters(n.nodeValue)) return true;
    }
    return false;
  }

  function isLeaf(el) {
    if (SKIP[el.tagName] || el.hasAttribute('data-no-i18n')) return false;
    /* A link counts as inline only when it is embedded in the element's own
       prose ("Prefer <a>email?</a>"), so that sentence stays one translatable
       unit and French can reorder it. A nav, whose only text lives inside its
       links, is not a leaf, so each link is keyed on its own. */
    var linksInline = ownText(el);
    for (var i = 0; i < el.children.length; i++) {
      var t = el.children[i].tagName;
      if (INLINE[t]) continue;
      if (t === 'A' && linksInline) continue;
      return false;
    }
    return hasLetters(norm(el.textContent || ''));
  }

  /* One deterministic walk, used by both the extractor and the runtime.

     The key and the English text are cached on the element the first time it is
     seen, and never recomputed. That matters because word-hover.js wraps every
     word in <span class="w"> as soon as it runs: hashing innerHTML on a later
     pass would hash all that scaffolding and never match. Caching also means the
     key survives switching language back and forth. */
  function walk(fn) {
    var roots = document.querySelectorAll('main, header, footer');
    for (var r = 0; r < roots.length; r++) {
      var stack = [roots[r]];
      while (stack.length) {
        var el = stack.shift();
        if (SKIP[el.tagName] || el.hasAttribute('data-no-i18n')) continue;
        if (el.__k || isLeaf(el)) {
          if (!el.__k) { el.__k = hash(norm(el.innerHTML)); el.__en = el.innerHTML; }
          fn(el, el.__k, 'html');
        } else {
          for (var i = 0; i < el.children.length; i++) stack.push(el.children[i]);
        }
      }
    }
    // attributes that are read aloud or shown as tooltips
    var attrs = document.querySelectorAll('[alt], [aria-label], [placeholder], [title]');
    for (var a = 0; a < attrs.length; a++) {
      if (attrs[a].closest('[data-no-i18n]')) continue;
      ['alt', 'aria-label', 'placeholder', 'title'].forEach(function (name) {
        var el = attrs[a], store = '__en_' + name, kk = '__k_' + name;
        var v = el[store] != null ? el[store] : el.getAttribute(name);
        if (v == null || !hasLetters(v)) return;
        if (!el[kk]) { el[kk] = hash(norm(v)); el[store] = v; }
        fn(el, el[kk], name);
      });
    }
    var t = document.querySelector('title');
    if (t) { if (!t.__k) { t.__k = hash(norm(t.textContent)); t.__en = t.textContent; } fn(t, t.__k, 'text'); }
    var d = document.querySelector('meta[name="description"]');
    if (d) {
      if (!d.__k) { d.__k = hash(norm(d.getAttribute('content') || '')); d.__en_content = d.getAttribute('content'); }
      fn(d, d.__k, 'content');
    }
  }

  window.__i18nWalk = walk;   // the extractor calls this

  /* The extractor reads the PRISTINE English captured on the first walk, never
     the live DOM, which word-hover.js has by then filled with <span> wrappers. */
  window.__i18nDump = function () {
    var out = [];
    walk(function (el, key, kind) {
      var en = kind === 'html' ? el.__en
             : kind === 'text' ? (el.__en != null ? el.__en : el.textContent)
             : (el['__en_' + kind] != null ? el['__en_' + kind] : el.getAttribute(kind));
      out.push({ key: key, kind: kind, en: String(en).replace(/\s+/g, ' ').trim() });
    });
    return out;
  };

  function apply(lang) {
    var dict = (lang === 'fr') ? (window.I18N_FR || {}) : null;
    walk(function (el, key, kind) {
      if (kind === 'html') {
        if (el.__en == null) el.__en = el.innerHTML;
        var v = dict ? dict[key] : null;
        el.innerHTML = (v != null) ? v : el.__en;
      } else if (kind === 'text') {
        if (el.__en == null) el.__en = el.textContent;
        el.textContent = (dict && dict[key] != null) ? dict[key] : el.__en;
      } else {
        var store = '__en_' + kind;
        if (el[store] == null) el[store] = el.getAttribute(kind);
        var t = dict ? dict[key] : null;
        el.setAttribute(kind, (t != null) ? t : el[store]);
      }
    });
    document.documentElement.lang = lang;
    /* header Download CV follows the site language (feedback 4 Nov) */
    var cvs = document.querySelectorAll('a.nav-cv');
    for (var c = 0; c < cvs.length; c++) cvs[c].href = 'assets/cv-3a7b1ab257ba/Mohamed-Dhia-Beldi-CV-' + (lang === 'fr' ? 'FR' : 'EN') + '.pdf';
    try { localStorage.setItem(STORE, lang); } catch (e) {}
    var b = document.querySelectorAll('.lang-btn');
    for (var i = 0; i < b.length; i++) {
      var on = b[i].dataset.lang === lang;
      b[i].classList.toggle('on', on);
      b[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    /* word-hover.js has already wrapped every word in a <span>; replacing
       innerHTML threw those away, so it has to wrap and re-measure again. */
    dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: lang } }));
  }

  function toggleMarkup(lang) {
    var host = document.querySelector('.nav-right');
    if (!host || host.querySelector('.lang')) return;
    var wrap = document.createElement('div');
    wrap.className = 'lang';
    wrap.setAttribute('data-no-i18n', '');   // the toggle labels are the same in both languages
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language / Langue');
    ['en', 'fr'].forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn' + (l === lang ? ' on' : '');
      b.dataset.lang = l;
      b.textContent = l.toUpperCase();
      b.setAttribute('aria-pressed', l === lang ? 'true' : 'false');
      b.setAttribute('lang', l);
      b.addEventListener('click', function () { apply(l); });
      wrap.appendChild(b);
    });
    host.insertBefore(wrap, host.firstChild);
  }

  function initial() {
    var saved;
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    if (saved === 'en' || saved === 'fr') return saved;
    return (navigator.language || 'en').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
  }

  function boot() {
    var lang = initial();
    toggleMarkup(lang);
    /* Always apply, even for English. The walk is what captures each element's
       pristine innerHTML and its key, and it has to happen before word-hover.js
       fills the page with <span class="w"> wrappers. Skipping it for English
       meant the first walk ran later, against already-wrapped markup. */
    apply(lang);
  }

  /* Runs synchronously. The tag sits at the end of <body>, so the DOM is complete,
     and word-hover.js (loaded next) must not wrap anything until the right
     language is in place. Waiting for DOMContentLoaded would invert that. */
  boot();
})();
