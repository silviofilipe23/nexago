import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type Theme = 'light' | 'dark';

/**
 * Alterna tema claro/escuro. Diferente do site Next.js, não precisa do hack de "null até
 * montar" (era pra evitar mismatch de hidratação SSR) — este app é CSR puro, então o DOM já
 * existe (com o `data-theme` aplicado pelo script inline do `index.html`) quando o componente
 * monta. Default dark (marca dark-first). Ícone: Sol no escuro (ação = clarear), Lua no claro.
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      (click)="toggle()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      class="inline-flex size-9 items-center justify-center rounded-full border border-line text-text-mute transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
    >
      @if (isLight()) {
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      } @else {
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      }
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = signal<Theme>(
    document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark',
  );
  protected readonly isLight = computed(() => this.theme() === 'light');
  protected readonly label = computed(() => (this.isLight() ? 'Ativar tema escuro' : 'Ativar tema claro'));

  protected toggle(): void {
    const next: Theme = this.theme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // localStorage indisponível (modo privado) — só não persiste.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f4f3' : '#050505');
    this.theme.set(next);
  }
}
