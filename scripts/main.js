(function () {
  // VIBE generations: silent looping preview that becomes a full player on click.
  // Everything else (baselines, instruction-following) is a plain native player.
  var loops = Array.prototype.slice.call(document.querySelectorAll('video[data-loop]'));

  // pause/mute every other sound source, keeping the silent VIBE loops running
  function solo(keep) {
    document.querySelectorAll('video, audio').forEach(function (m) {
      if (m === keep) return;
      if (m.hasAttribute('data-loop') && m.dataset.activated !== '1') {
        m.muted = true;
      } else {
        try { m.pause(); } catch (e) {}
      }
    });
  }

  var vio = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (v.dataset.activated === '1') return;      // user is controlling it now
      if (e.isIntersecting) v.play().catch(function () {});
      else v.pause();
    });
  }, { threshold: 0.2 }) : null;

  loops.forEach(function (v) {
    v.muted = true; v.loop = true;
    // a "static" loop (e.g. the instruction-following source video) just plays
    // silently on a loop — no sound, no player handoff.
    if (v.hasAttribute('data-static')) {
      if (vio) vio.observe(v);
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'loopvid-wrap';
    v.parentNode.insertBefore(wrap, v);
    wrap.appendChild(v);
    var badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'sound-badge';
    badge.textContent = '🔇';
    badge.setAttribute('aria-label', 'Play with sound');
    wrap.appendChild(badge);

    function activate(e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      if (v.dataset.activated === '1') return;
      v.dataset.activated = '1';
      solo(v);
      v.loop = false;
      v.controls = true;          // hand over the native player
      v.muted = false;
      try { v.currentTime = 0; } catch (_) {}   // start audio from the beginning
      v.play().catch(function () {});
      wrap.classList.add('audio-on');
      badge.remove();
      v.removeEventListener('click', activate);
      if (vio) vio.unobserve(v);
    }
    v.addEventListener('click', activate);
    badge.addEventListener('click', activate);
    if (vio) vio.observe(v);
  });

  // a controls video/audio (baseline, instruction-following, or an activated VIBE) owns the sound
  document.addEventListener('play', function (e) {
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute('data-loop') && el.dataset.activated !== '1') return;
    solo(el);
  }, true);

  // ---------- sticky nav active-state ----------
  var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  var sections = Array.prototype.slice.call(navLinks)
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  var linkFor = new Map();
  navLinks.forEach(function (a) { linkFor.set(a.getAttribute('href').slice(1), a); });
  if (sections.length) {
    var nav = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          navLinks.forEach(function (l) { l.classList.remove('active'); });
          var link = linkFor.get(e.target.id);
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    sections.forEach(function (s) { nav.observe(s); });
  }

  // ---------- reveal on scroll ----------
  var revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(function (el) { revealObs.observe(el); });
})();
