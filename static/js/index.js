window.HELP_IMPROVE_VIDEOJS = false;

/* --------------------------------------------------------------------------
   VIBE media loading and audio handling.

   The page carries ~50 clips. Loading them all would be hostile on a slow
   connection, so the order is: inline blur (already in the HTML) -> poster
   -> video, each step only once the clip is close to being looked at.

   Must run after the DOM exists AND after bulmaCarousel has cloned its slides,
   otherwise the clones are plain videos with no sound control, so it is called
   from the DOMContentLoaded handler at the bottom rather than at parse time.
   The scripts now carry defer, which fires them in order before that event.
   -------------------------------------------------------------------------- */
function initVibeAudio() {
  var SPEAKER =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-9v2a7 7 0 0 1 0 14v2a9 9 0 0 0 0-18z"/>' +
    '</svg>';

  /* Someone on 2G, or with Data Saver on, gets posters and a play button
     instead of ~50 clips downloading themselves. */
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  var SLOW = conn.saveData === true ||
             /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '');

  var IO = ('IntersectionObserver' in window);

  /* Someone who asked the OS for less motion gets none: no clip starts itself,
     and the banner stops looping and grows a native control. */
  var REDUCE = !!(window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Step 1: the still.

     The poster used to go on the video element, which meant the browser threw
     it away the instant playback started and swapped straight to whatever
     frame had decoded, so a clip flashed as it began. Instead the poster is
     its own layer underneath the video: it fades in over the 16px blur, and
     it stays there. The video is transparent until it has actually decoded a
     frame, at which point it crossfades in on top of an identical image, so
     there is nothing to see happening. */
  function attachPoster(v) {
    var src = v.dataset.poster;
    if (!src) return;
    delete v.dataset.poster;
    var wrap = v.parentElement;
    if (!wrap || !wrap.classList.contains('loopvid-wrap')) { v.poster = src; return; }
    if (wrap.querySelector('.clip-poster')) return;

    /* Marks the wrapper as owning a poster layer. Only those wrappers hide
       their video until it has a frame; anything else stays visible, which is
       what the banner needs since it carries a native poster attribute. */
    wrap.classList.add('has-poster');

    var img = document.createElement('img');
    img.className = 'clip-poster';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    img.addEventListener('load', function () { wrap.classList.add('poster-on'); }, { once: true });
    img.src = src;
    wrap.insertBefore(img, v);

    /* A clip that will start itself gets a head start on the download here,
       700px out, rather than waiting for the play observer at 500px. Doing it
       from JS keeps it to the clips actually approaching; declaring it in the
       markup made every loop clip fetch its header on page load. */
    if (v.hasAttribute('data-loop')) { v.preload = 'auto'; }

    /* loadeddata is the first frame, which is the earliest moment the video
       has anything worth showing. Before that it would paint black. */
    if (v.readyState >= 2) { wrap.classList.add('video-on'); }
    else {
      v.addEventListener('loadeddata', function () {
        wrap.classList.add('video-on');
      }, { once: true });
    }
    /* If the clip 404s or the codec is unsupported, leave the still up and
       take the play button away rather than offering a control that cannot work. */
    v.addEventListener('error', function () {
      wrap.classList.add('clip-failed');
      var b = wrap.querySelector('.sound-badge');
      if (b) b.remove();
    }, { once: true });
  }

  var posterIO = IO ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      attachPoster(e.target);
      posterIO.unobserve(e.target);
    });
  }, { rootMargin: '700px 0px' }) : null;

  document.querySelectorAll('video[data-poster]').forEach(function (v) {
    if (posterIO) { posterIO.observe(v); }
    else { attachPoster(v); }
  });

  /* Step 2: play the silent preview only while it is actually on screen. */
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

  var playIO = (IO && !SLOW && !REDUCE) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (v.dataset.activated === '1') return;
      if (e.isIntersecting) { v.play().catch(function () {}); }
      else { v.pause(); }
    });
  /* The head start now comes from the poster observer at 700px, which flips
     preload to auto, so this one does not need a wide margin of its own. A
     500px margin here also pulled the banner in on a phone and doubled the
     cold load; 150px keeps that off the first screen while still starting
     playback slightly before the clip is looked at. */
  }, { threshold: 0.1, rootMargin: '150px 0px' }) : null;

  if (REDUCE) {
    var banner = document.getElementById('vibe-banner');
    if (banner) {
      banner.removeAttribute('autoplay');
      banner.loop = false;
      banner.controls = true;
      try { banner.pause(); } catch (e) {}
    }
  }

  Array.prototype.slice.call(document.querySelectorAll('video[data-loop]')).forEach(function (v) {
    if (v.dataset.wired === '1') return;   // carousel clones can re-enter here
    v.dataset.wired = '1';
    v.muted = true;
    v.loop = true;

    /* The instruction-following input clip carries no audio: it just loops.
       It keeps the native controls it ships with, because otherwise it is a
       video that autoplays forever with no way for anyone to stop it. */
    if (v.hasAttribute('data-static')) {
      if (playIO) playIO.observe(v);
      return;
    }

    /* clip() already emitted the wrapper so the aspect ratio is reserved from
       the first paint; only fall back to building one for anything that did not */
    var wrap;
    if (v.parentElement && v.parentElement.classList.contains('loopvid-wrap')) {
      wrap = v.parentElement;
    } else {
      wrap = document.createElement('div');
      wrap.className = 'loopvid-wrap';
      v.parentNode.insertBefore(wrap, v);
      wrap.appendChild(v);
    }

    /* The markup ships `controls` so the clip is operable even if this script
       never runs. Take them off only here, at the moment a badge exists to
       replace them, so the failure mode is "native player" not "dead box". */
    v.removeAttribute('controls');

    var badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'sound-badge';
    badge.innerHTML = SPEAKER + '<span>' + (SLOW ? 'Play' : 'Play with sound') + '</span>';
    /* Eighteen badges reading "Play this clip with sound" are indistinguishable
       in a screen reader's element list. The video already knows what it is. */
    badge.setAttribute('aria-label',
      'Play ' + (v.getAttribute('aria-label') || 'this clip') + ' with sound');
    wrap.appendChild(badge);

    function activate(e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      if (v.dataset.activated === '1') return;
      v.dataset.activated = '1';
      solo(v);
      /* result clips play once so you can compare them; the hero banner is 4s
         of animation and would just freeze on its last frame */
      v.loop = v.hasAttribute('data-keep-loop');
      v.controls = true;
      v.muted = false;
      attachPoster(v);          // in case it was activated before it scrolled in
      try { v.currentTime = 0; } catch (_) {}
      v.play().catch(function () {});
      wrap.classList.add('audio-on');
      /* activate() removes the button the user is standing on. Without this
         hand-off, focus falls back to <body> and they restart from the top. */
      var hadFocus = document.activeElement === badge;
      badge.remove();
      if (hadFocus) { v.setAttribute('tabindex', '-1'); v.focus(); }
      v.removeEventListener('click', activate);
      if (playIO) playIO.unobserve(v);
      if (posterIO) posterIO.unobserve(v);
    }

    v.addEventListener('click', activate);
    badge.addEventListener('click', activate);
    if (playIO) playIO.observe(v);
  });

  document.addEventListener('play', function (e) {
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute('data-loop') && el.dataset.activated !== '1') return;
    solo(el);
  }, true);

  if (SLOW) document.documentElement.classList.add('save-data');
}

/* Carousel bootstrap. This was $(document).ready, which pulled 30KB of gzipped
   jQuery over a third cross-origin connection to do one thing the platform has
   done natively for years. bulma-carousel is a UMD bundle with no jQuery
   reference in it, so nothing else needed the dependency.
   bulmaSlider.attach() went with it: the page has no range inputs for it to
   attach to. */
/* --------------------------------------------------------------------------
   Make the vendored carousel usable without a mouse.

   As shipped it is not. Its arrows and dots are bare <div>s with a click
   handler: no role, no tabindex, no name. And its own arrow-key support is
   dead code, because the defaults define `navigationKeys` while onKeyUp reads
   `options.keyNavigation`, a name nothing ever sets. So a keyboard user
   reached sample 1 of 6 and stopped, with five of the six comparison samples
   and three of the four instruction blocks unreachable.

   Off-screen slides were a second problem: the library clips them with
   overflow rather than hiding them, and the string "aria" does not appear
   anywhere in the bundle. Every hidden slide kept its videos in the tab order
   and its text in the screen reader's flow, so the same six samples were read
   as one run with no boundary between them. `inert` fixes both at once.
   -------------------------------------------------------------------------- */
function initCarouselA11y(instances) {
  var roots = document.querySelectorAll('.carousel');

  Array.prototype.forEach.call(roots, function (root, i) {
    var c = instances && instances[i];
    var slider = root.querySelector('.slider');

    if (slider) {
      // focusable but roleless, nameless and (see above) inert: a dead stop
      slider.removeAttribute('tabindex');
      slider.setAttribute('role', 'group');
      slider.setAttribute('aria-roledescription', 'carousel');
      slider.setAttribute('aria-label', root.dataset.label || 'Samples');
    }

    [['previous', 'Previous sample'], ['next', 'Next sample']].forEach(function (p) {
      var el = root.querySelector('.slider-navigation-' + p[0]);
      if (!el) return;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', p[1]);
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        if (!c) { el.click(); return; }
        if (p[0] === 'previous') { c.previous(); } else { c.next(); }
      });
    });

    /* The library calls _pagination.refresh() on every slide change, which
       re-renders the dots and drops anything set on them. So the keydown is
       delegated to the container, which survives, and the attributes are
       re-applied from syncSlides() each time the dots are rebuilt. */
    var pagination = root.querySelector('.slider-pagination');
    if (pagination) {
      pagination.addEventListener('keydown', function (e) {
        var dot = e.target.closest && e.target.closest('.slider-page');
        if (!dot) return;
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        dot.click();
      });
    }

    function labelDots() {
      Array.prototype.forEach.call(root.querySelectorAll('.slider-page'), function (dot, k) {
        dot.setAttribute('role', 'button');
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('aria-label', 'Go to sample ' + (k + 1));
      });
    }

    /* Keep only the visible slide in the tab order and the accessibility tree.
       `inert` does both jobs, so no separate aria-hidden is needed. */
    function syncSlides() {
      var items = root.querySelectorAll('.slider-item');
      if (!items.length) return;
      /* With infinite:true the library clones slides, so state.next does not
         index the DOM order and using it marked the visible slide inert.
         .is-current is maintained by the library and is the truth. */
      var current = root.querySelectorAll('.slider-item.is-current');
      if (!current.length) return;          // mid-transition: leave it alone
      Array.prototype.forEach.call(items, function (it) {
        var on = it.classList.contains('is-current');
        if ('inert' in it) { it.inert = !on; }
        else { it.setAttribute('aria-hidden', on ? 'false' : 'true'); }
      });
    }

    /* The library only sets is-active on a dot once you move, so at load no dot
       was lit and there was no way to tell which sample you were on. */
    function markActiveDot() {
      var dots = Array.prototype.slice.call(root.querySelectorAll('.slider-page'));
      if (!dots.length) return;
      /* The library's own state.index is the logical slide number. Deriving it
         from DOM position instead does not work: infinite mode clones slides,
         so .slider-item count (15) has no fixed relationship to the slide
         count the dots represent (6). */
      var idx = (c && c.state && typeof c.state.index === 'number') ? c.state.index : 0;
      var real = ((idx % dots.length) + dots.length) % dots.length;
      dots.forEach(function (d, k) { d.classList.toggle('is-active', k === real); });
    }

    function refresh() { labelDots(); syncSlides(); markActiveDot(); }

    /* The library rebuilds the dots on its own schedule, not only on the events
       it emits, so anything set on them can be wiped at any time. Watching the
       container is the only reliable way to keep them focusable. */
    if (pagination && 'MutationObserver' in window) {
      new MutationObserver(function () { labelDots(); markActiveDot(); })
        .observe(pagination, { childList: true, subtree: true });
    }

    refresh();
    if (c && typeof c.on === 'function') {
      c.on('after:show', refresh);
      c.on('show', refresh);
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  var instances = bulmaCarousel.attach('.carousel', {
    slidesToScroll: 1,
    slidesToShow: 1,
    loop: true,
    infinite: true,
    autoplay: false,      // these carousels hold audio results, so let the
    pauseOnHover: true,   // reader move between them deliberately
    /* The library's own default is `navigationKeys`, but onKeyUp reads
       `keyNavigation`. Pass the name the code actually looks at. */
    keyNavigation: true
  });

  initVibeAudio();        // after the slides are cloned, so clones get wired too
  try { initCarouselA11y(instances); } catch (e) {}
});

/* Copy the BibTeX. An 11 line entry with an 8 author line is a nuisance to
   select by hand, and every page at this bar has a one-click copy. */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.bibtex-copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = document.querySelector(b.dataset.copy);
      if (!src || !navigator.clipboard) return;
      navigator.clipboard.writeText(src.innerText.trim()).then(function () {
        b.textContent = 'Copied';
        b.classList.add('is-done');
        setTimeout(function () {
          b.textContent = 'Copy';
          b.classList.remove('is-done');
        }, 1600);
      }).catch(function () {});
    });
  });

  /* Mark the section the reader is actually in. */
  var links = document.querySelectorAll('.vibe-nav-links a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var a = byId[e.target.id];
      if (!a) return;
      if (e.isIntersecting) {
        links.forEach(function (x) { x.classList.remove('is-current'); });
        a.classList.add('is-current');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  Object.keys(byId).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) seen.observe(el);
  });
});

/* Reveal-on-scroll, the matrix tabs, and the active pagination dot. */
document.addEventListener('DOMContentLoaded', function () {
  var REDUCE = !!(window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Bars grow and cards rise as they come into view.

     Deliberately NOT an IntersectionObserver. With a threshold above zero, a
     fast scroll can jump an element past the viewport between two sampling
     frames, the callback never fires, and because the CSS hides un-revealed
     cards the content stays invisible for good. That happened here: four
     Instruction Following blocks and every result chart rendered blank.
     A rAF-throttled sweep costs nothing at twelve elements and cannot miss. */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (REDUCE) {
    reveals.forEach(function (el) { el.classList.add('in-view'); });
  } else if (reveals.length) {
    document.documentElement.classList.add('js-reveal');

    var ticking = false;
    function sweep() {
      ticking = false;
      var h = window.innerHeight || document.documentElement.clientHeight;
      for (var k = reveals.length - 1; k >= 0; k--) {
        var el = reveals[k];
        var r = el.getBoundingClientRect();
        // anywhere within a screen of the viewport counts as arrived
        if (r.top < h + 120 && r.bottom > -120) {
          el.classList.add('in-view');
          reveals.splice(k, 1);
        }
      }
      if (!reveals.length) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(sweep);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    sweep();

    /* Last resort. If anything above still has not been reached, show it
       rather than leave the page with holes in it. */
    window.setTimeout(function () {
      reveals.slice().forEach(function (el) { el.classList.add('in-view'); });
    }, 4000);
  }

  /* Matrix criterion tabs. */
  var tabs = document.querySelectorAll('.mx-tab');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var root = t.closest('.matrix');
      root.querySelectorAll('.mx-tab').forEach(function (x) {
        x.classList.remove('is-on');
        x.setAttribute('aria-selected', 'false');
      });
      root.querySelectorAll('.mx-panel').forEach(function (p) { p.classList.remove('is-on'); });
      t.classList.add('is-on');
      t.setAttribute('aria-selected', 'true');
      var panel = root.querySelector('#' + t.dataset.panel);
      if (panel) panel.classList.add('is-on');
    });
    /* arrow keys move between tabs, which is what a tablist is expected to do */
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var all = Array.prototype.slice.call(t.closest('.mx-tabs').children);
      var i = all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
      var next = all[(i + all.length) % all.length];
      if (next) { next.focus(); next.click(); }
    });
  });
});
