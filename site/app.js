/* MarketLens client runtime — deliberately tiny.
   Pages are fully server-rendered; this adds app-shell behaviour and the
   ask-a-question box. */

(function () {
  'use strict';

  /* ---------------------------------------------- Service worker (PWA) */

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* non-fatal */ });
    });
  }

  /* ------------------------------------- Remember ticker scroll position */

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

  /* ------------------------------------------- Keep installed app in-app */

  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (standalone) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.target === '_blank') return;
      if (/^(https?:)?\/\//.test(href) && a.hostname !== location.hostname) return;
      if (href.charAt(0) === '/') {
        e.preventDefault();
        location.href = href;
      }
    });
  }

  /* -------------------------------------------- Staleness of the edition */

  var dot = document.querySelector('.masthead-meta .live-dot');
  if (dot && window.__ML_GENERATED__) {
    try {
      var age = (Date.now() - new Date(window.__ML_GENERATED__).getTime()) / 3600000;
      if (age > 30) { dot.style.background = 'var(--down)'; dot.title = 'This edition is more than a day old'; }
      else if (age > 20) { dot.style.background = 'var(--accent)'; dot.title = 'Next edition due shortly'; }
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ Ask box */

  var ask = document.querySelector('.ask');
  if (!ask) return;

  var storyId = ask.getAttribute('data-story');
  var form = ask.querySelector('.ask-form');
  var input = ask.querySelector('.ask-input');
  var send = ask.querySelector('.ask-send');
  var answer = ask.querySelector('.ask-answer');
  var counter = ask.querySelector('.ask-count .n');
  var busy = false;

  function setCount() {
    if (counter) counter.textContent = String(input.value.length);
  }

  input.addEventListener('input', function () {
    setCount();
    input.style.height = 'auto';
    input.style.height = Math.min(180, input.scrollHeight) + 'px';
  });

  ask.querySelectorAll('.ask-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      input.value = chip.textContent.trim();
      setCount();
      input.focus();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });

  // Cmd/Ctrl+Enter submits, matching the convention people expect in a textarea.
  input.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  function show(html, cls) {
    answer.hidden = false;
    answer.className = 'ask-answer' + (cls ? ' ' + cls : '');
    answer.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;

    var question = input.value.trim();
    if (!question) { input.focus(); return; }

    busy = true;
    send.disabled = true;
    send.textContent = 'Thinking';
    show('<div class="ask-thinking"><i></i><i></i><i></i></div>', 'is-loading');

    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);

    fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storyId: storyId, question: question }),
      signal: controller.signal,
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok || !r.data.answer) {
          show('<p class="ask-error">' + escapeHtml(r.data.error || 'Something went wrong. Try again.') + '</p>');
          return;
        }
        var paras = r.data.answer.split(/\n{2,}/).map(function (p) {
          return '<p>' + escapeHtml(p.trim()).replace(/\n/g, '<br>') + '</p>';
        }).join('');
        show('<div class="ask-q">' + escapeHtml(question) + '</div>' + paras
          + '<p class="ask-caveat">Generated from this story’s analysis. Not investment advice.</p>');
      })
      .catch(function (err) {
        show('<p class="ask-error">'
          + (err.name === 'AbortError'
            ? 'That took too long. Try a shorter question.'
            : 'Could not reach the server. Check your connection and try again.')
          + '</p>');
      })
      .finally(function () {
        clearTimeout(timeout);
        busy = false;
        send.disabled = false;
        send.textContent = 'Ask';
      });
  });
}());
