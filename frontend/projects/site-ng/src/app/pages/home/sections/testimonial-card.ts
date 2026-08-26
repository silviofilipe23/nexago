import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

/**
 * Porta de `TestimonialCard` (site Next.js). O original compunha um `SpotlightCard` genérico
 * (glow que segue o cursor + lift no hover) — como esse primitivo não existe em `site-ng` e
 * este agente só pode escrever nos arquivos de `pages/home/sections/`, o comportamento do
 * spotlight foi trazido pra dentro deste componente (`onSpotlightMove` seta `--mx`/`--my`
 * via `style.setProperty`, mesma técnica do original). Reutilizável fora do home (ex.:
 * páginas de arenas/organizadores que importam o tipo `Testimonial`).
 */
@Component({
  selector: 'app-testimonial-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <figure
      (mousemove)="onSpotlightMove($event)"
      class="group/spot relative flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 p-7 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
    >
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style="background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255, 106, 26, 0.13), transparent 60%)"
      ></span>
      <svg
        class="size-6 text-brand transition-transform duration-300 ease-out group-hover/spot:scale-110 motion-reduce:transition-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
        <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
      </svg>
      <blockquote class="mt-4 flex-1 text-base leading-relaxed text-fg">&ldquo;{{ quote() }}&rdquo;</blockquote>
      <figcaption class="mt-6 border-t border-line pt-5">
        <div class="font-display text-sm font-700 tracking-tight text-fg">{{ name() }}</div>
        <div class="mt-0.5 text-xs text-text-mute">{{ role() }}</div>
      </figcaption>
    </figure>
  `,
})
export class TestimonialCard {
  readonly quote = input.required<string>();
  readonly name = input.required<string>();
  readonly role = input.required<string>();

  protected onSpotlightMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}
