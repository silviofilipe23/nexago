import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';

type Stat = { value: string; label: string };

const STATS: readonly Stat[] = [
  { value: '12k+', label: 'atletas' },
  { value: '480+', label: 'torneios' },
  { value: '90+', label: 'arenas' },
];

/**
 * Porta de `Hero` (site Next.js, `components/sections/Hero.tsx`) — hero de texto simples
 * (eyebrow + headline + subcopy + CTAs + stats), sem a cena GSAP. NOTA: no site Next.js este
 * componente não é importado por nenhuma rota (`app/page.tsx` usa só `CinematicHero`) — parece
 * ter sido substituído pela versão cinemática e ficado como peça solta/reutilizável. Portado
 * mesmo assim porque estava no escopo pedido; a composição da home (fora do meu escopo) decide
 * se ele entra na página ou não.
 *
 * O stagger de entrada (Framer `staggerChildren`/`delayChildren`) virou uma série de
 * `nxRevealDelay` crescentes no `RevealDirective`, na mesma ordem dos elementos do source.
 * O glow radial pulsante (`animate` do Framer com loop infinito) virou uma animação CSS pura
 * com `@media (prefers-reduced-motion: reduce)` desligando o loop, mesmo efeito de
 * `useReducedMotion()` no source.
 */
@Component({
  selector: 'app-hero-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective],
  template: `
    <section class="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 pt-24 pb-16 sm:px-6">
      <!-- Glow laranja -->
      <div aria-hidden="true" class="hero-glow pointer-events-none absolute left-1/2 top-[14%] -z-10 size-[min(100vw,720px)] -translate-x-1/2 rounded-full"></div>

      <!-- Linhas diagonais (eco do logo) -->
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style="background-image: repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 96px); mask-image: radial-gradient(closest-side, #000 30%, transparent 80%)"
      ></div>
      <!-- Vinheta inferior -->
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48"
        style="background: linear-gradient(to top, #050505, transparent)"
      ></div>

      <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center">
        <!-- Eyebrow -->
        <div
          nxReveal
          [nxRevealDelay]="50"
          class="mb-6 inline-flex items-center gap-2 rounded-pill border border-line-strong bg-glass px-4 py-1.5 backdrop-blur-md"
        >
          <span class="relative flex size-2">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60"></span>
            <span class="relative inline-flex size-2 rounded-full bg-brand"></span>
          </span>
          <span class="text-xs font-600 tracking-wide text-text-mute"> Liga nexaGO · 1ª etapa em 24/out </span>
        </div>

        <!-- Headline -->
        <h1
          nxReveal
          [nxRevealDelay]="130"
          class="font-display text-[clamp(1.7rem,7.5vw,5.25rem)] font-800 leading-[0.98] tracking-[-0.03em] text-balance text-fg"
        >
          Domine a areia.
          <br />
          <span class="text-brand">Do saque ao título.</span>
        </h1>

        <!-- Subcopy -->
        <p nxReveal [nxRevealDelay]="210" class="mt-6 max-w-xl text-balance text-base leading-relaxed text-text-mute sm:text-lg">
          A plataforma dos esportes de areia. Inscrições, chaves ao vivo, ranking e a Liga nexaGO num só app —
          conectando atletas, organizadores e arenas.
        </p>

        <!-- CTAs -->
        <div nxReveal [nxRevealDelay]="290" class="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <a nxButton href="https://linktr.ee/nexago" target="_blank" rel="noopener noreferrer" class="w-full sm:w-auto">
            Baixar o app
          </a>
          <a nxButton="secondary" href="#liga" class="w-full sm:w-auto">Conhecer a Liga</a>
        </div>

        <!-- Stats -->
        <dl
          nxReveal
          [nxRevealDelay]="370"
          class="mt-14 grid w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-4 border border-line bg-line"
        >
          @for (s of stats; track s.label) {
            <div class="bg-surface-0 px-3 py-5">
              <dt class="sr-only">{{ s.label }}</dt>
              <dd class="font-mono text-2xl font-700 tracking-tight text-fg sm:text-3xl">{{ s.value }}</dd>
              <dd class="mt-1 font-mono text-xs font-500 uppercase tracking-wider text-text-dim">{{ s.label }}</dd>
            </div>
          }
        </dl>
      </div>
    </section>
  `,
  styles: `
    .hero-glow {
      background: radial-gradient(closest-side, rgba(255, 106, 26, 0.28), rgba(255, 106, 26, 0.06) 55%, transparent 75%);
      opacity: 0.5;
      transform: translateX(-50%) scale(0.9);
      animation: heroGlowPulse 9s ease-in-out infinite;
    }

    @keyframes heroGlowPulse {
      0%,
      100% {
        opacity: 0.5;
        transform: translateX(-50%) scale(0.9);
      }
      50% {
        opacity: 0.85;
        transform: translateX(-50%) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero-glow {
        animation: none;
        opacity: 0.65;
        transform: translateX(-50%) scale(0.95);
      }
    }
  `,
})
export class HeroSection {
  protected readonly stats = STATS;
}
