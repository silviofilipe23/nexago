# NexaGO Landing Implementation Template

Use this as a starter. Adapt to the project stack (Angular/React/static HTML).

## 1) Semantic Section Skeleton

```html
<main class="landing">
  <section id="hero" class="section reveal">
    <h1>Run tournaments faster. Engage athletes. Track every match live.</h1>
    <p>Create professional competitions with rankings, payments, and real-time updates in one platform.</p>
    <div class="cta-group">
      <a class="btn btn-primary" href="/signup">Create Tournament</a>
      <a class="btn btn-secondary" href="/signup?role=athlete">Join as Athlete</a>
    </div>
  </section>

  <section id="problem" class="section reveal">
    <h2>Managing tournaments manually costs time and trust</h2>
    <p>Disorganized brackets, delayed updates, and payment friction hurt athlete experience.</p>
  </section>

  <section id="solution" class="section reveal">
    <h2>Everything in one competitive engine</h2>
    <div class="grid stagger">
      <article class="card">Tournament creation</article>
      <article class="card">Athlete participation</article>
      <article class="card">Rankings automation</article>
      <article class="card">Integrated payments</article>
      <article class="card">Live match tracking</article>
    </div>
  </section>

  <section id="how-it-works" class="section reveal">
    <h2>How it works</h2>
    <ol>
      <li>Create tournament structure and rules</li>
      <li>Invite athletes and confirm entries</li>
      <li>Track brackets, rankings, and live scores</li>
    </ol>
  </section>

  <section id="demo" class="section reveal">
    <h2>See brackets and rankings in action</h2>
    <div class="demo-grid stagger">
      <div class="demo-card">Bracket preview</div>
      <div class="demo-card">Ranking preview</div>
    </div>
  </section>

  <section id="audience" class="section reveal">
    <h2>Built for modern sports operations</h2>
    <div class="grid stagger">
      <article class="card">Tournament organizers</article>
      <article class="card">Sports clubs and leagues</article>
      <article class="card">Competitive athletes</article>
    </div>
  </section>

  <section id="social-proof" class="section reveal">
    <h2>Trusted by growing sports communities</h2>
    <div class="grid stagger">
      <blockquote class="card">"Cut setup time by 60%."</blockquote>
      <blockquote class="card">"Athlete engagement increased in every event."</blockquote>
      <blockquote class="card">"Live tracking improved credibility with sponsors."</blockquote>
    </div>
  </section>

  <section id="final-cta" class="section reveal">
    <h2>Start your next tournament today</h2>
    <p>Launch in minutes and scale to full-season competitions.</p>
    <a class="btn btn-primary" href="/signup">Create Tournament</a>
  </section>
</main>
```

## 2) Visual Tokens (Dark + Orange)

```css
:root {
  --bg: #0c0f14;
  --bg-soft: #131a24;
  --text: #e7edf7;
  --muted: #a4b0c0;
  --accent: #ff7a1a;
  --accent-hover: #ff8f3f;
  --border: #253044;
  --radius: 14px;
}
```

## 3) Motion (Lightweight)

```css
.reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 420ms ease, transform 420ms ease;
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.stagger > * {
  transition: opacity 420ms ease, transform 420ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .reveal,
  .stagger > * {
    transition: none;
    transform: none;
  }
}
```

```js
const items = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");

      const staggerChildren = entry.target.querySelectorAll(".stagger > *");
      staggerChildren.forEach((child, index) => {
        child.style.transitionDelay = `${index * 70}ms`;
      });

      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.15 }
);

items.forEach((item) => observer.observe(item));
```

## 4) Performance Guardrails

- Ship critical styles first; defer non-critical assets.
- Use responsive images and lazy loading for media below the fold.
- Keep animation JS minimal and framework-native when possible.
- Avoid large third-party animation libraries unless explicitly required.
- Validate mobile Lighthouse performance before final polish.
