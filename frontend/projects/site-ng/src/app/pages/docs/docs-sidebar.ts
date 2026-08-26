import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

export type SidebarGroup = { title: string; items: { id: string; title: string }[] };

/**
 * Sumário lateral com destaque da seção visível (scrollspy). Porta de `DocsSidebar.tsx`: mesmo
 * `IntersectionObserver` (rootMargin recuado pro topo/base da viewport), reagindo a mudanças de
 * `groups()` via `effect()` — necessário porque `DocsAudiencePage` reaproveita a mesma instância
 * ao navegar entre audiências (`withComponentInputBinding()`), então o efeito precisa reobservar
 * as novas seções em vez de rodar só uma vez.
 */
@Component({
  selector: 'app-docs-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav aria-label="Nesta página" class="space-y-6">
      @for (group of groups(); track group.title) {
        <div>
          <p class="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            {{ group.title }}
          </p>
          <ul class="space-y-0.5 border-l border-line">
            @for (item of group.items; track item.id) {
              <li>
                <a
                  [href]="'#' + item.id"
                  [attr.aria-current]="active() === item.id ? 'true' : null"
                  [class]="itemClasses(item.id)"
                >
                  {{ item.title }}
                </a>
              </li>
            }
          </ul>
        </div>
      }
    </nav>
  `,
})
export class DocsSidebar {
  readonly groups = input.required<SidebarGroup[]>();

  protected readonly active = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const groups = this.groups();
      const ids = groups.flatMap((g) => g.items.map((i) => i.id));
      const sections = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (sections.length === 0) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]) this.active.set(visible[0].target.id);
        },
        { rootMargin: '-20% 0px -65% 0px' },
      );
      sections.forEach((el) => observer.observe(el));
      onCleanup(() => observer.disconnect());
    });
  }

  protected itemClasses(id: string): string {
    const base = '-ml-px block border-l py-1 pl-3.5 pr-2 text-[13px] leading-snug transition-colors duration-150';
    return this.active() === id
      ? `${base} border-brand font-semibold text-brand`
      : `${base} border-transparent text-text-mute hover:border-line-strong hover:text-fg`;
  }
}
