import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Confirmação de ação sensível. Usa <dialog> nativo: Esc, backdrop e devolução
 * de foco saem de graça e ficam corretos para leitor de tela.
 */
@Component({
  selector: 'bo-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <dialog
      #dialog
      [class.wide]="size() === 'md'"
      (cancel)="onEscape($event)"
      (keydown.escape)="dismiss()"
      (click)="onBackdropClick($event)"
    >
      <div class="inner">
        <h2>{{ title() }}</h2>
        @if (description()) {
          <p class="desc">{{ description() }}</p>
        }

        <ng-content />

        @if (error()) {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ error() }}</span>
          </div>
        }
      </div>

      <!-- Fora do .inner: com conteúdo alto, o corpo rola e os botões ficam. -->
      <div class="actions">
        <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="dismiss()">
          Cancelar
        </button>
        <button
          type="button"
          class="bo-mini-btn"
          [class.bo-mini-btn-primary]="tone() === 'primary'"
          [class.danger]="tone() === 'danger'"
          [disabled]="busy() || confirmDisabled()"
          (click)="confirmed.emit()"
        >
          @if (busy()) {
            <span class="bo-spinner small" aria-hidden="true"></span>
          }
          {{ confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(440px, calc(100vw - 32px));
      /* Conteúdo alto (formulário + histórico) rola dentro do diálogo em vez
         de estourar a viewport em telas baixas. */
      max-height: min(640px, calc(100vh - 48px));
      padding: 0;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      color: var(--nx-text);
    }

    dialog.wide {
      width: min(560px, calc(100vw - 32px));
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
    }

    dialog[open] {
      display: flex;
      flex-direction: column;
    }

    .inner {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.01em;
    }

    .desc {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 4px 22px 22px;
    }

    .bo-mini-btn.danger {
      background: rgba(255, 59, 48, 0.12);
      border-color: rgba(255, 59, 48, 0.35);
      color: var(--nx-live);
    }

    .bo-mini-btn.danger:hover:not(:disabled) {
      background: rgba(255, 59, 48, 0.2);
    }

    .bo-spinner.small {
      width: 13px;
      height: 13px;
      border-width: 2px;
      border-color: rgba(244, 244, 245, 0.3);
      border-top-color: currentColor;
    }
  `,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly description = input('');
  readonly confirmLabel = input('Confirmar');
  readonly tone = input<'primary' | 'danger'>('primary');
  /** `md` para conteúdo com formulário; `sm` (padrão) para só confirmar. */
  readonly size = input<'sm' | 'md'>('sm');
  readonly busy = input(false);
  readonly confirmDisabled = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        el.showModal();
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }

  /**
   * O fechamento é sempre pedido ao pai (que controla `open`) — não dá pra
   * depender do evento `close` do <dialog>: ele não dispara em todos os
   * navegadores quando o fechamento é programático.
   */
  protected dismiss(): void {
    if (this.busy()) {
      return;
    }
    this.dismissed.emit();
  }

  /** Esc nativo: cancela o fechamento automático e segue pelo mesmo caminho. */
  protected onEscape(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }

  /** Clique no backdrop chega no próprio <dialog>, não no conteúdo. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.dismiss();
    }
  }
}
