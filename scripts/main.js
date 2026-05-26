(function () {
  function videosIn(sectionId) {
    const sec = document.getElementById(sectionId);
    if (!sec) return [];
    return Array.from(sec.querySelectorAll('video'));
  }

  window.playAll = function (sectionId) {
    videosIn(sectionId).forEach(v => { try { v.currentTime = 0; v.play(); } catch (e) {} });
  };
  window.pauseAll = function (sectionId) {
    videosIn(sectionId).forEach(v => v.pause());
  };
  window.restartAll = function (sectionId) {
    videosIn(sectionId).forEach(v => { v.pause(); v.currentTime = 0; });
  };

  // sticky nav active-state via IntersectionObserver
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  const sections = Array.from(navLinks).map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const linkFor = new Map();
  navLinks.forEach(a => linkFor.set(a.getAttribute('href').slice(1), a));

  if (sections.length) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('active'));
          const link = linkFor.get(e.target.id);
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    sections.forEach(s => obs.observe(s));
  }

  // reveal-on-scroll
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

  // gallery tabs
  document.querySelectorAll('.gallery-tabs').forEach(group => {
    const buttons = group.querySelectorAll('button[data-tab]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.gallery-panel').forEach(p => {
          p.classList.toggle('active', p.dataset.tab === tab);
        });
      });
    });
  });
})();
