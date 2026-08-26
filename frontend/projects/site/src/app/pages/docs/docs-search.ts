import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { searchDocs } from '../../../lib/docs/search';
import type { DocAudienceId, SearchDoc } from '../../../lib/docs/types';

const AUDIENCE_TONE: Record<DocAudienceId, string> = {
  atletas: 'text-brand bg-brand-tint',
  organizadores: 'text-win bg-win/12',
  arenas: 'text-pending bg-pending/12',
};

/**
 * Busca da documentação — filtra `SEARCH_INDEX` em memória via `searchDocs` e navega pro
 * recurso (`/docs/{audience}#{id}`). Porta de `DocsSearch.tsx`: combobox acessível (role
 * combobox + listbox), atalho "/" foca de qualquer lugar da página (fora de campos de texto),
 * clique fora fecha o painel. O host É a raiz (equivalente ao `rootRef` do source) — os
 * listeners globais usam o target `document:` no `host` object em vez de
 * `@HostListener`/addEventListener manual.
 */
@Component({
  selector: 'app-docs-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    '[class]': 'wrapperOuterClasses()',
    '(document:keydown)': 'onDocumentKeydown($event)',
    '(document:mousedown)': 'onDocumentMousedown($event)',
  },
  templateUrl: './docs-search.html',
})
export class DocsSearch {
  readonly index = input.required<SearchDoc[]>();
  readonly hero = input(false);

  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputRef');

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly cursor = signal(0);
  protected readonly listboxId = `docs-search-listbox-${Math.random().toString(36).slice(2)}`;

  protected readonly results = computed(() => searchDocs(this.index(), this.query()));
  protected readonly showPanel = computed(() => this.open() && this.query().trim().length >= 2);
  protected readonly statusText = computed(() => (this.showPanel() ? `${this.results().length} resultados` : ''));

  // Host precisa ser "relative" sempre (o painel de resultados é absolute); largura/max-width
  // variam entre a busca "hero" (home da doc) e a compacta (topo de cada audiência).
  protected readonly wrapperOuterClasses = computed(() =>
    this.hero() ? 'relative mx-auto block w-full max-w-xl' : 'relative block w-full',
  );
  protected readonly wrapperClasses = computed(
    () =>
      `flex items-center gap-3 rounded-pill border bg-surface-1 transition-colors duration-200 focus-within:border-brand ${
        this.hero() ? 'border-line-strong px-5 py-3.5 shadow-elev-2' : 'border-line px-4 py-2.5'
      }`,
  );
  protected readonly searchIconClasses = computed(() => `shrink-0 text-text-dim ${this.hero() ? 'size-5' : 'size-4'}`);
  protected readonly inputClasses = computed(
    () => `w-full bg-transparent text-fg outline-none placeholder:text-text-dim ${this.hero() ? 'text-base' : 'text-sm'}`,
  );

  protected onInput(value: string): void {
    this.query.set(value);
    this.cursor.set(0);
    this.open.set(true);
  }

  protected onFocus(): void {
    this.open.set(true);
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    const results = this.results();
    if (event.key === 'Escape') {
      this.open.set(false);
    } else if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      this.cursor.update((c) => Math.min(c + 1, results.length - 1));
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      this.cursor.update((c) => Math.max(c - 1, 0));
    } else if (event.key === 'Enter' && this.showPanel() && results[this.cursor()]) {
      event.preventDefault();
      this.go(results[this.cursor()]);
    }
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    event.preventDefault();
    this.inputRef()?.nativeElement.focus();
  }

  protected onDocumentMousedown(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.elementRef.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  protected onResultClick(): void {
    this.open.set(false);
    this.query.set('');
  }

  protected setCursor(i: number): void {
    this.cursor.set(i);
  }

  protected resultClasses(index: number): string {
    const base = 'block w-full cursor-pointer rounded-3 px-4 py-3 text-left transition-colors duration-150';
    return index === this.cursor() ? `${base} bg-surface-2` : base;
  }

  protected toneClasses(audience: DocAudienceId): string {
    return `rounded-pill px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${AUDIENCE_TONE[audience]}`;
  }

  private go(doc: SearchDoc): void {
    this.open.set(false);
    this.query.set('');
    this.router.navigate(['/docs', doc.audience], { fragment: doc.id });
  }
}
