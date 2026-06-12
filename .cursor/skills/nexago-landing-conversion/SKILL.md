---
name: nexago-landing-conversion
description: Creates high-conversion landing pages for sports tournament platforms with a storytelling scroll structure, dark UI, orange accent, subtle animations, and mobile-first performance constraints. Use when the user asks for landing page design/copy/implementation focused on tournament creation, athlete participation, rankings, payments, live match tracking, or sign-up conversion.
---

# NexaGO Landing Conversion

## Purpose

Build a modern, conversion-focused landing page for NexaGO that drives:
- Sign up
- Tournament creation

The page must prioritize:
- Storytelling scroll progression
- Clear value communication
- Fast loading and mobile-first UX
- Subtle motion only (no heavy visual effects)

## Required Sections

Always include these sections in this order:

1. Hero (strong value proposition + primary CTA)
2. Problem
3. Solution (core features)
4. How it works
5. Visual demo (brackets + rankings)
6. Target audience
7. Social proof
8. Final CTA

## Core Product Themes

The narrative must highlight:
- Tournament creation
- Athlete participation
- Rankings
- Payments
- Live match tracking

## Design Direction

- Dark UI base
- Orange accent
- Sports + tech aesthetic
- High readability and strong hierarchy
- Conversion-first layout and copy

## Motion Rules

Use only subtle, performance-safe motion:
- Fade-in on scroll
- Staggered reveal for grouped cards/items
- Smooth transitions for hover/focus/state changes

Avoid:
- Large blur/glow stacks
- Heavy parallax layers
- Scroll-jacking or long blocking animations

## Execution Workflow

Copy this checklist and track progress:

```markdown
Landing Progress:
- [ ] Step 1: Define conversion goal + CTA strategy
- [ ] Step 2: Build section-by-section narrative
- [ ] Step 3: Write conversion copy for each section
- [ ] Step 4: Apply visual system (dark + orange)
- [ ] Step 5: Add subtle scroll/interaction motion
- [ ] Step 6: Validate mobile-first responsiveness
- [ ] Step 7: Validate performance constraints
- [ ] Step 8: Final conversion QA
```

### Step 1: Conversion Goal + CTA Strategy

Set:
- Primary CTA: `Create Tournament`
- Secondary CTA: `Join as Athlete`

Rules:
- Keep CTA visible in hero and final section.
- Repeat primary CTA after key trust moments (solution/social proof).

### Step 2: Storytelling Structure

Use this flow:
- Tension: manual tournament chaos
- Relief: NexaGO as centralized platform
- Proof: visuals, metrics, testimonials
- Action: immediate tournament creation

Each section must push to the next section with a clear narrative handoff.

### Step 3: Conversion Copy

Write:
- Benefit-led headlines
- Objection-reducing subcopy
- Action verbs on CTAs

Tone:
- Confident
- Short sentences
- Outcome-focused language

### Step 4: Visual System

Use:
- Dark backgrounds with contrast-safe text
- Orange accents for CTAs, key stats, and active states
- Card-based presentation for features and audience blocks

### Step 5: Motion Layer

Implement:
- Scroll-triggered fade + slight translateY
- Stagger delays for feature/demo/social cards
- 150ms-250ms interaction transitions

Support reduced motion:
- Respect `prefers-reduced-motion`
- Disable non-essential transforms

### Step 6: Mobile-First

Start at small viewport first, then scale up.

Minimum checks:
- CTA buttons remain visible and tap-friendly
- Text stays readable at small sizes
- Demo blocks stack cleanly
- Section spacing remains consistent

### Step 7: Performance

Targets:
- Minimize JS for animations (IntersectionObserver-first)
- Lazy-load non-critical media
- Use compressed modern image formats
- Avoid render-blocking assets

### Step 8: Final Conversion QA

Verify:
- Value proposition is understandable within 5 seconds
- CTA appears early and repeatedly (without noise)
- Trust elements exist before final CTA
- No section feels decorative-only

## Output Contract

When this skill is applied, produce in this order:

1. Section map (1-2 lines per section)
2. Final landing copy (headlines + subcopy + CTA labels)
3. Interaction spec (what animates and when)
4. Implementation output (HTML/CSS/JS or framework component)
5. Performance checklist pass/fail

## Implementation Template

Use the starter blueprint in:
- [implementation-template.md](implementation-template.md)

## Non-Negotiables

- Keep effects subtle and conversion-safe
- Mobile-first before desktop polish
- No excessive animation libraries unless explicitly requested
- Every section must support the sign-up/create-tournament goal
