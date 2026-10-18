import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { squadCodeLink } from '../../../lib/squad';
import { ToastService } from '../../shared/ui/toast';

/**
 * Código do embaixador: o código abre o portal do atleta com `?squad=CODIGO` (a atribuição já
 * entende) e "Copiar" leva só o código, para digitar no pagamento da inscrição. Sem % de
 * desconto: o desconto real tem teto na taxa da plataforma e varia por inscrição.
 */
@Component({
  selector: 'app-squad-code-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-2.5 rounded-3 border border-dashed border-brand/45 bg-brand/5 py-2 pl-3 pr-2">
      <a
        [href]="link()"
        target="_blank"
        rel="noopener"
        class="group/code min-w-0 flex-1 rounded-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        [attr.aria-label]="'Usar o código ' + code() + ' no portal do atleta'"
      >
        <span class="flex items-center gap-1.5 font-mono text-sm font-bold text-fg transition-colors group-hover/code:text-brand">
          <span class="truncate">{{ code() }}</span>
          <svg class="size-3.5 shrink-0 text-text-dim transition-colors group-hover/code:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 17 17 7" /><path d="M8 7h9v9" />
          </svg>
        </span>
        <span class="mt-px block truncate text-[11px] text-text-dim">Desconto na 1ª inscrição</span>
      </a>
      <button
        type="button"
        (click)="copy()"
        class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 bg-surface-2 px-2.5 font-display text-xs font-semibold text-fg transition-colors hover:bg-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        [attr.aria-label]="'Copiar o código ' + code()"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
        Copiar
      </button>
    </div>
  `,
})
export class SquadCodeBox {
  readonly code = input.required<string>();

  private readonly toast = inject(ToastService);
  protected readonly link = computed(() => squadCodeLink(this.code()));

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.toast.show(`Código ${this.code()} copiado`);
    } catch {
      // Sem permissão de área de transferência (http, iframe): mostra o código para anotar.
      this.toast.show(`Código: ${this.code()}`);
    }
  }
}
