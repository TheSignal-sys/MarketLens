/* MarketLens client runtime — deliberately tiny.
   Pages are fully server-rendered; this only adds app-shell behaviour. */

(function () {
  'use strict';

  /* Service worker: makes the site installable and readable offline. */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* non-fatal */ });
    });
  }

  /* Keep the ticker tape's scroll position across navigations within a session,
     so moving between pages does not reset it to the far left. */
  var tape = document.querySelector('.tape');
  if (tape) {
    try {
      var saved = sessionStorage.getItem('ml:tape');
      if (saved) tape.scrollLeft = parseInt(saved, 10) || 0;
      tape.addEventListener('scroll', function () {
        try { sessionStorage.setItem('ml:tape', String(tape.scrollLeft)); } catch (e) { /* private mode */ }
      }, { passive: true });
    } catch (e) { /* storage unavailable */ }
  }

  /* Standalone (installed) mode: keep internal links inside the app window
     rather than kicking the user out to Safari. */
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (standalone) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.target === '_blank' || /^(https?:)?\/\//.test(href) && a.hostname !== location.hostname) return;
      if (href.charAt(0) === '/') {
        e.preventDefault();
        location.href = href;
      }
    });
  }

  /* Reveal how stale the current edition is, in the reader's own timezone. */
  var meta = document.querySelector('.masthead-meta .live-dot');
  if (meta && window.__ML_GENERATED__) {
    try {
      var age = (Date.now() - new Date(window.__ML_GENERATED__).getTime()) / 3600000;
      if (age > 30) meta.style.background = 'var(--down)';
      else if (age > 20) meta.style.background = 'var(--accent)';
    } catch (e) { /* ignore */ }
  }
}());
