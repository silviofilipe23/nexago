/* ============================================================
   FUN PARQUE — Animações e interacções
   Stack: Lenis (smooth scroll) + GSAP ScrollTrigger + Swiper
============================================================ */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  gsap.registerPlugin(ScrollTrigger);

  /* ----------------------------------------------------------
     LENIS — smooth scroll
  ---------------------------------------------------------- */
  let lenis = null;
  if (!prefersReducedMotion && typeof Lenis !== 'undefined') {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // âncoras internas com smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (mobileMenuOpen) toggleMenu(false); // lenis parado não faz scrollTo
      if (lenis) {
        lenis.scrollTo(target, { offset: -70 });
      } else {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  /* ----------------------------------------------------------
     PRELOADER + intro do hero
  ---------------------------------------------------------- */
  const preloader = document.getElementById('preloader');

  function heroIntro() {
    if (prefersReducedMotion) return;
    gsap.timeline()
      .from('.hero__line > span', {
        yPercent: 110,
        duration: 0.9,
        stagger: 0.12,
        ease: 'power3.out'
      })
      .from('.hero__cta .btn', {
        y: 24,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out'
      }, '-=0.35');
  }

  window.addEventListener('load', () => {
    // sem animação se o utilizador prefere movimento reduzido ou se a
    // página carrega numa tab em background (rAF suspenso — a animação
    // congelaria o conteúdo num estado invisível)
    if (prefersReducedMotion || document.hidden) {
      preloader.remove();
      return;
    }
    gsap.timeline()
      .to('.preloader__logo', { scale: 1.08, duration: 0.45, ease: 'power2.inOut' })
      .to(preloader, {
        yPercent: -100,
        duration: 0.7,
        ease: 'power3.inOut',
        onComplete: () => preloader.remove()
      })
      .add(heroIntro, '-=0.25');
  });

  // fallback: se "load" demorar (CDN lenta), remover preloader
  setTimeout(() => {
    if (document.body.contains(preloader)) {
      preloader.remove();
      if (!document.hidden) heroIntro();
    }
  }, 4000);

  /* ----------------------------------------------------------
     REVEALS por scroll — [data-reveal]
  ---------------------------------------------------------- */
  if (!prefersReducedMotion) {
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 48,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          once: true
        }
      });
    });
  }

  /* ----------------------------------------------------------
     TÍTULOS palavra a palavra — [data-split]
  ---------------------------------------------------------- */
  document.querySelectorAll('[data-split]').forEach((el) => {
    if (prefersReducedMotion) return;
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words
      .map((w) => `<span class="split-word"><span>${w}</span></span>`)
      .join(' ');
    gsap.from(el.querySelectorAll('.split-word > span'), {
      yPercent: 110,
      duration: 0.75,
      stagger: 0.045,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 86%',
        once: true
      }
    });
  });

  /* ----------------------------------------------------------
     CONTADORES — [data-counter]
  ---------------------------------------------------------- */
  document.querySelectorAll('[data-counter]').forEach((el) => {
    const end = parseInt(el.dataset.counter, 10);
    if (prefersReducedMotion) {
      el.textContent = end;
      return;
    }
    const obj = { val: 0 };
    gsap.to(obj, {
      val: end,
      duration: 1.6,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.val); },
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true
      }
    });
  });

  /* ----------------------------------------------------------
     HEADER — esconder ao descer, progresso, estado scrolled
  ---------------------------------------------------------- */
  const header = document.getElementById('header');
  const progress = document.getElementById('scrollProgress');
  let lastY = 0;

  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;

    header.classList.toggle('is-scrolled', y > 40);
    if (y > lastY && y > 300 && !mobileMenuOpen) {
      header.classList.add('is-hidden');
    } else {
      header.classList.remove('is-hidden');
    }
    lastY = y;

    progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    toTop.classList.toggle('is-visible', y > 600);
  }

  if (lenis) {
    lenis.on('scroll', onScroll);
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------
     LINK ACTIVO na navegação
  ---------------------------------------------------------- */
  const navLinks = document.querySelectorAll('.nav-link');
  const sectionIds = ['about', 'actividades', 'aniv', 'events', 'faqs', 'test'];
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((l) =>
        l.classList.toggle('is-active', l.dataset.section === entry.target.id)
      );
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sectionIds.forEach((id) => {
    const s = document.getElementById(id);
    if (s) sectionObserver.observe(s);
  });

  /* ----------------------------------------------------------
     MENU MOBILE
  ---------------------------------------------------------- */
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  let mobileMenuOpen = false;

  function toggleMenu(force) {
    mobileMenuOpen = typeof force === 'boolean' ? force : !mobileMenuOpen;
    burger.classList.toggle('is-open', mobileMenuOpen);
    burger.setAttribute('aria-expanded', mobileMenuOpen);
    mobileMenu.classList.toggle('is-open', mobileMenuOpen);
    mobileMenu.setAttribute('aria-hidden', !mobileMenuOpen);
    if (lenis) mobileMenuOpen ? lenis.stop() : lenis.start();
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
  }

  burger.addEventListener('click', () => toggleMenu());
  mobileMenu.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => toggleMenu(false))
  );

  /* ----------------------------------------------------------
     ACCORDIONS — "como funciona" + FAQs
  ---------------------------------------------------------- */
  function setupAccordion(headSelector, panelGetter) {
    document.querySelectorAll(headSelector).forEach((head) => {
      head.addEventListener('click', () => {
        const panel = panelGetter(head);
        const isOpen = head.getAttribute('aria-expanded') === 'true';
        head.setAttribute('aria-expanded', String(!isOpen));
        panel.style.maxHeight = isOpen ? '0px' : panel.scrollHeight + 'px';
      });
    });
  }
  setupAccordion('.accordion__head', (h) => h.nextElementSibling);
  setupAccordion('.faq-item__q', (h) => h.nextElementSibling);

  /* ----------------------------------------------------------
     TABS das FAQs
  ---------------------------------------------------------- */
  const faqTabs = document.querySelectorAll('.faq-tab');
  const faqPanels = document.querySelectorAll('.faq-panel');
  faqTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      faqTabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      faqPanels.forEach((p) => {
        const active = p.dataset.panel === tab.dataset.tab;
        p.classList.toggle('is-active', active);
        if (active && !prefersReducedMotion) {
          gsap.from(p.querySelectorAll('.faq-item'), {
            y: 18,
            autoAlpha: 0,
            duration: 0.4,
            stagger: 0.06,
            ease: 'power2.out',
            clearProps: 'all'
          });
        }
      });
    });
  });

  /* ----------------------------------------------------------
     SWIPER — testemunhos
  ---------------------------------------------------------- */
  if (typeof Swiper !== 'undefined') {
    new Swiper('#testSwiper', {
      slidesPerView: 1,
      spaceBetween: 20,
      loop: true,
      grabCursor: true,
      autoplay: prefersReducedMotion ? false : { delay: 4500, disableOnInteraction: false },
      pagination: { el: '.swiper-pagination', clickable: true },
      navigation: {
        prevEl: '.test__arrow--prev',
        nextEl: '.test__arrow--next'
      },
      breakpoints: {
        640: { slidesPerView: 2 },
        1024: { slidesPerView: 3 }
      }
    });
  }

  /* ----------------------------------------------------------
     VOLTAR AO TOPO
  ---------------------------------------------------------- */
  const toTop = document.getElementById('toTop');
  toTop.addEventListener('click', () => {
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  /* ----------------------------------------------------------
     PARALLAX suave no hero
  ---------------------------------------------------------- */
  if (!prefersReducedMotion) {
    gsap.to('.hero__media', {
      yPercent: 12,
      ease: 'none',
      scrollTrigger: {
        trigger: '.section_hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });
  }

})();
