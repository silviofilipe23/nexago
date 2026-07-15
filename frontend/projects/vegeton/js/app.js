/* ============================================================
   XNRGY clone — interactions & animations
   GSAP + ScrollTrigger + Lenis (same stack as the original site)
   ============================================================ */
(function () {
  "use strict";

  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Lenis smooth scroll ---------- */
  let lenis = null;
  if (!prefersReducedMotion && typeof Lenis !== "undefined") {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- split headings into line masks ---------- */
  document.querySelectorAll("[data-split]").forEach((el) => {
    if (el.querySelector(".line-mask")) return; // already split in markup (hero)
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts
      .map((line) => `<span class="line-mask"><span class="line">${line.trim()}</span></span>`)
      .join("");
  });

  /* ---------- hero intro timeline ---------- */
  const heroLines = document.querySelectorAll(".c-hero .line");
  const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
  heroTl
    .from(".site-header", { opacity: 0, duration: 0.8 })
    .from(heroLines, { yPercent: 110, duration: 1.1, stagger: 0.12 }, "-=0.4")
    .from(".c-hero__box", { scale: 0, opacity: 0, duration: 0.8 }, "-=0.6")
    .from(".c-hero .lines i", { scaleY: 0, transformOrigin: "top", duration: 1, stagger: 0.1 }, "-=0.8");

  /* subtle parallax on hero title while scrolling away */
  gsap.to(".c-hero__wrapper", {
    yPercent: -18,
    opacity: 0.4,
    ease: "none",
    scrollTrigger: { trigger: ".c-hero", start: "top top", end: "bottom top", scrub: true },
  });

  /* ---------- heading line reveals on scroll ---------- */
  document.querySelectorAll("[data-split]").forEach((el) => {
    gsap.from(el.querySelectorAll(".line"), {
      yPercent: 110,
      duration: 1,
      ease: "power3.out",
      stagger: 0.1,
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });

  /* ---------- generic fade-up reveals ---------- */
  document.querySelectorAll("[data-reveal]").forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  /* ---------- image clip reveals ---------- */
  document.querySelectorAll("[data-image-reveal]").forEach((el) => {
    gsap.to(el, {
      clipPath: "inset(0 0 0% 0)",
      duration: 1.2,
      ease: "power3.inOut",
      scrollTrigger: { trigger: el, start: "top 82%" },
    });
    const img = el.querySelector("img");
    if (img) {
      gsap.from(img, {
        scale: 1.15,
        duration: 1.4,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 82%" },
      });
    }
  });

  /* ---------- full-bleed parallax ---------- */
  document.querySelectorAll("[data-parallax]").forEach((el) => {
    const img = el.querySelector("img");
    if (!img) return;
    gsap.fromTo(
      img,
      { yPercent: -12, scale: 1.15 },
      {
        yPercent: 12,
        scale: 1.15,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
      }
    );
  });

  /* ---------- pinned stacking cards (works with any card count) ---------- */
  const clubs = document.querySelector(".c-clubs");
  if (clubs) {
    const cards = gsap.utils.toArray(clubs.querySelectorAll(".club-card"));
    const rest = cards.slice(1);
    if (rest.length) {
      // o CSS aplica translateY(110%) como fallback sem JS; o GSAP lê esse valor
      // como y em pixels, então zera o y e assume só o yPercent para o controle
      gsap.set(rest, { y: 0, yPercent: 110 });
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: clubs,
          start: "top top",
          end: "+=" + rest.length * 100 + "%",
          pin: true,
          scrub: 0.6,
        },
      });
      rest.forEach((card, i) => {
        tl.to(cards[i], { scale: 0.94, opacity: 0.6, ease: "none", duration: 1 }, i)
          .to(card, { yPercent: 0, ease: "none", duration: 1 }, i);
      });
    }
  }

  /* ---------- header hide/show + background ---------- */
  const header = document.getElementById("site-header");
  let lastY = 0;
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      const y = self.scroll();
      header.classList.toggle("is-scrolled", y > 40);
      if (y > lastY && y > window.innerHeight * 0.5) header.classList.add("is-hidden");
      else header.classList.remove("is-hidden");
      lastY = y;
    },
  });

  /* ---------- sticky CTA visibility ---------- */
  const stickyCta = document.getElementById("sticky-cta");
  ScrollTrigger.create({
    start: () => window.innerHeight * 0.6,
    end: "max",
    onToggle: (self) => stickyCta.classList.toggle("is-visible", self.isActive),
  });

  /* ---------- offcanvas menu ---------- */
  const offcanvas = document.getElementById("offcanvas");
  const openBtn = document.getElementById("menu-open");
  const closeBtn = document.getElementById("menu-close");
  const menuLinks = offcanvas.querySelectorAll(".offcanvas__nav li");
  const menuActions = offcanvas.querySelector(".offcanvas__actions");
  let menuOpen = false;

  const menuTl = gsap.timeline({ paused: true });
  menuTl
    .set(offcanvas, { visibility: "visible" })
    .fromTo(offcanvas, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.6, ease: "power3.inOut" })
    .from(menuLinks, { yPercent: 60, opacity: 0, duration: 0.45, stagger: 0.05, ease: "power2.out" }, "-=0.2")
    .from(menuActions, { y: 24, opacity: 0, duration: 0.4, ease: "power2.out" }, "-=0.25");

  function openMenu() {
    menuOpen = true;
    offcanvas.classList.add("is-open");
    offcanvas.setAttribute("aria-hidden", "false");
    openBtn.setAttribute("aria-expanded", "true");
    if (lenis) lenis.stop();
    menuTl.play();
  }
  function closeMenu() {
    menuOpen = false;
    offcanvas.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("aria-expanded", "false");
    menuTl.reverse().eventCallback("onReverseComplete", () => {
      offcanvas.classList.remove("is-open");
      if (lenis) lenis.start();
    });
  }

  openBtn.addEventListener("click", openMenu);
  closeBtn.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuOpen) closeMenu();
  });
  offcanvas.querySelectorAll("a[href^='#']").forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      closeMenu();
      if (target) {
        e.preventDefault();
        setTimeout(() => {
          if (lenis) lenis.scrollTo(target, { offset: 0 });
          else target.scrollIntoView({ behavior: "smooth" });
        }, 650);
      }
    });
  });

  /* ---------- cookie banner ---------- */
  const banner = document.getElementById("cookie-banner");
  const COOKIE_KEY = "vegeton-consent";
  if (!localStorage.getItem(COOKIE_KEY)) {
    banner.hidden = false;
    gsap.from(banner, { y: 60, opacity: 0, duration: 0.6, ease: "power2.out", delay: 1.2 });
  }
  banner.querySelectorAll("[data-cookie]").forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem(COOKIE_KEY, btn.dataset.cookie);
      gsap.to(banner, {
        y: 40,
        opacity: 0,
        duration: 0.4,
        ease: "power2.in",
        onComplete: () => (banner.hidden = true),
      });
    });
  });
  const cookiePrefs = document.getElementById("cookie-prefs");
  if (cookiePrefs) {
    cookiePrefs.addEventListener("click", (e) => {
      e.preventDefault();
      banner.hidden = false;
      gsap.fromTo(banner, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
    });
  }

  /* ---------- anchor links outside the menu ---------- */
  document.querySelectorAll("header a[href^='#'], main a[href^='#'], footer a[href^='#']").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href === "#") return;
    a.addEventListener("click", (e) => {
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        if (lenis) lenis.scrollTo(target);
        else target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
