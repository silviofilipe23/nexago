// DOCUMENT vem de @angular/common: é a convenção deste repo (organizer e site
// importam assim). O @angular/core também reexporta na v20, mas seguir a casa
// evita dois padrões para a mesma coisa.
import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Lê o breakpoint do CSS em vez de repetir o número em TypeScript.
 *  `--ar-bp-md` e `--ar-bp-sm` saem do `_breakpoints.scss` via `styles.scss`;
 *  duplicar o valor aqui criaria duas fontes que divergem em silêncio. */
function breakpointPx(doc: Document, prop: string, fallback: number): number {
  const raw = getComputedStyle(doc.documentElement).getPropertyValue(prop).trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly doc = inject(DOCUMENT);
  private readonly width = signal(this.doc.defaultView?.innerWidth ?? 1440);

  /** ≤ 900px: a sidebar sai e entram topbar + drawer. */
  readonly isCompact = computed(
    () => this.width() <= breakpointPx(this.doc, '--ar-bp-md', 900),
  );

  /** ≤ 720px: entra a bottom-nav. */
  readonly isPhone = computed(() => this.width() <= breakpointPx(this.doc, '--ar-bp-sm', 720));

  constructor() {
    const view = this.doc.defaultView;
    view?.addEventListener('resize', () => this.width.set(view.innerWidth), { passive: true });
  }
}
