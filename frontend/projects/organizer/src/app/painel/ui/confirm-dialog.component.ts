import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Diálogo de confirmação do painel — usado por ações que não dão pra desfazer sozinho
 *  (encerrar temporada, cancelar liga). Espelha o `AlertDialog` do app: título, texto de
 *  consequência, "Voltar" e o botão de ação (destrutivo quando `destructive`). */
@Component({
  selector: 'og-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-dialog-backdrop',
    '(click)': 'cancelled.emit()',
    '(document:keydown.escape)': 'cancelled.emit()',
  },
  template: `
    <div class="og-dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()" (click)="$event.stopPropagation()">
      <div class="og-dialog-title">{{ title() }}</div>
      <p class="og-dialog-text">{{ message() }}</p>
      @if (error(); as msg) {
        <p class="og-dialog-error">{{ msg }}</p>
      }
      <div class="og-dialog-actions">
        <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="cancelled.emit()">Voltar</button>
        <button
          type="button"
          class="og-mini-btn"
          [class.og-mini-btn-primary]="!destructive()"
          [class.og-mini-btn-danger]="destructive()"
          [disabled]="busy()"
          (click)="confirmed.emit()"
        >
          {{ busy() ? 'Aguarde…' : confirmLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(7, 7, 8, 0.66);
      backdrop-filter: blur(4px);
    }
    .og-dialog {
      width: min(420px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .og-dialog-title {
      font-family: var(--nx-font-display);
      font-size: 17px;
      font-weight: 800;
      color: var(--nx-text);
    }
    .og-dialog-text {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 8px 0 0;
    }
    .og-dialog-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 10px 0 0;
    }
    .og-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
    .og-mini-btn-danger {
      background: var(--nx-live);
      border-color: var(--nx-live);
      color: #0a0a0a;
      font-weight: 700;
    }
  `,
})
export class OgConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirmar');
  readonly destructive = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
