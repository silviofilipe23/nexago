import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';

type ShowcaseStep = { n: string; title: string; desc: string; image: string; alt: string };
type Base = { ry: number; rx: number; ty: number };

const STEPS: readonly ShowcaseStep[] = [
  {
    n: 'JOGUE',
    title: 'Participe de torneios',
    desc: 'Encontre torneios, inscreva sua dupla e acompanhe o ranking ao vivo.',
    image: '/app/atletas.png',
    alt: 'Tela inicial do app nexaGO para atletas, com torneio em destaque e missões',
  },
  {
    n: 'ORGANIZE',
    title: 'Crie torneios',
    desc: 'Crie etapas, gere chaves automáticas e gerencie tudo num painel só.',
    image: '/app/organizadores.png',
    alt: 'Tela de gerenciamento de torneio do nexaGO, com categorias, financeiro e partidas',
  },
  {
    n: 'GERENCIE',
    title: 'Sua arena',
    desc: 'Gerencie suas quadras, horários, aluguéis e a agenda da sua arena.',
    image: '/app/arenas.png',
    alt: 'Tela de gerenciamento de arena do nexaGO, com quadras, horários, aluguéis e agenda',
  },
];

const BASE: readonly Base[] = [
  { ry: 17, rx: 3, ty: 0 },
  { ry: 0, rx: 0, ty: -24 },
  { ry: -17, rx: 3, ty: 0 },
];

/**
 * Porta de `ShowcasePhones` (site Next.js, `components/sections/ShowcasePhones.tsx`) — vitrine
 * 3-up de telas do app com leve tilt 3D interativo (desktop + sem reduced-motion). Não fazia
 * parte da lista de arquivos do escopo original, mas é o único filho de `ComoFunciona` (que
 * está no escopo) — sem ele a seção fica sem conteúdo. Vive aqui em `sections/` porque é
 * detalhe de implementação privado do `ComoFunciona`, não uma seção de topo própria.
 *
 * As imagens (`/app/atletas.png`, `/app/organizadores.png`, `/app/arenas.png`) foram copiadas
 * de `projects/site/public/app/` pra `projects/site/public/app/` (mesmo path público) —
 * são screenshots reais do app, não dado dinâmico do Firestore, então não há placeholder
 * aplicável aqui.
 */
@Component({
  selector: 'app-showcase-phones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <div class="mt-16 grid grid-cols-1 gap-14 sm:gap-12 lg:mt-20 lg:grid-cols-3 lg:items-start lg:gap-8">
      @for (s of steps; track s.n; let i = $index) {
        <div nxReveal [nxRevealDelay]="i * 100">
          <div class="flex flex-col items-center transition-opacity duration-300" [class.opacity-50]="isDimmed(i)">
            <div
              (mouseenter)="onEnter(i)"
              (mouseleave)="onLeave()"
              (mousemove)="onMove($event, i)"
              [style.transform]="transformFor(i)"
              class="relative mx-auto w-full max-w-[218px] transition-transform duration-300 ease-out [transform-style:preserve-3d]"
              [class.z-10]="active() === i"
            >
              <div
                aria-hidden="true"
                class="pointer-events-none absolute -inset-8 -z-10 rounded-full transition-opacity duration-300"
                [class.opacity-100]="active() === i"
                [class.opacity-60]="active() !== i"
                style="background: radial-gradient(closest-side, rgba(255,106,26,0.22), transparent 70%)"
              ></div>
              <div
                class="rounded-[2.6rem] border bg-[#0c0c0e] p-[6px] shadow-elev-3 transition-colors duration-300"
                [class]="active() === i ? 'border-brand/40' : 'border-[#26262b]'"
              >
                <div class="overflow-hidden rounded-[2.2rem]">
                  <img
                    [src]="s.image"
                    [alt]="s.alt"
                    width="1179"
                    height="2556"
                    loading="lazy"
                    class="h-auto w-full"
                  />
                </div>
              </div>
            </div>

            <div class="mt-10 text-center">
              <span class="font-mono text-sm font-600 tracking-widest text-brand">{{ s.n }}</span>
              <h3 class="mt-2 font-display text-2xl font-bold tracking-tight text-fg">{{ s.title }}</h3>
              <p class="mx-auto mt-2 max-w-[260px] text-sm leading-relaxed text-text-mute">{{ s.desc }}</p>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ShowcasePhones {
  protected readonly steps = STEPS;

  protected readonly active = signal<number | null>(null);
  private readonly interactive = signal(false); // desktop + sem reduced-motion

  constructor() {
    const mq = window.matchMedia('(min-width: 1024px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => this.interactive.set(mq.matches && !rm.matches);
    update();
    mq.addEventListener('change', update);
    rm.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => {
      mq.removeEventListener('change', update);
      rm.removeEventListener('change', update);
    });
  }

  protected isDimmed(i: number): boolean {
    const a = this.active();
    return a !== null && a !== i;
  }

  protected onEnter(i: number): void {
    if (this.interactive()) this.active.set(i);
  }

  protected onLeave(): void {
    this.active.set(null);
  }

  protected transformFor(i: number): string | undefined {
    if (!this.interactive()) return undefined;
    const b = BASE[i];
    const active = this.active();
    if (active === i) {
      return `perspective(1600px) rotateX(0deg) rotateY(0deg) translateY(${b.ty - 14}px) scale(1.06)`;
    }
    const scale = active !== null ? 0.96 : 1;
    return `perspective(1600px) rotateY(${b.ry}deg) rotateX(${b.rx}deg) translateY(${b.ty}px) scale(${scale})`;
  }

  /** Segue o mouse com o tilt 3D enquanto o card está com hover — grava direto no `style` do
   *  nó nativo (fora do binding do Angular) pelo mesmo motivo do source: atualização a cada
   *  `mousemove` é fina demais pra passar pelo ciclo de change detection a cada frame. */
  protected onMove(event: MouseEvent, i: number): void {
    if (!this.interactive() || this.active() !== i) return;
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const rx = (-py * 9).toFixed(2);
    const ry = (px * 9).toFixed(2);
    el.style.transform = `perspective(1600px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${BASE[i].ty - 14}px) scale(1.06)`;
  }
}
