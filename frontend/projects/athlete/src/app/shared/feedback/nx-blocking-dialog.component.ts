import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { NxFeedbackIconComponent } from './nx-feedback-icon.component';
import type { NxFeedbackTone } from './nx-feedback.types';

const FOCUSABLE =
  'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let nextId = 0;

/** Erro CRÍTICO que interrompe o fluxo (design 12c) — o atleta não consegue
 *  seguir sem escolher um caminho.
 *
 *  Reserve pra beco sem saída de verdade: pagamento recusado com sessão
 *  expirada, inscrição perdida, conflito que exige decisão. Erro que dá pra
 *  consertar na própria tela é inline; aviso que só informa é banner ou toast.
 *  Serve também para decisão informada que o atleta precisa tomar antes de
 *  seguir (ex.: regra de horário de pico) — nesse caso, `role="dialog"`.
 *
 *  É declarativo de propósito — o chamador renderiza dentro de um `@if` e
 *  controla o próprio estado, sem overlay imperativo global. */
@Component({
  selector: 'app-nx-blocking-dialog',
  imports: [NxFeedbackIconComponent],
  template: `
    <div
      class="dialog"
      [attr.role]="role()"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      [attr.aria-describedby]="bodyId"
    >
      <span class="chip">
        <app-nx-feedback-icon [tone]="tone()" [size]="26" />
      </span>

      <h2 class="title" [id]="titleId">{{ heading() }}</h2>
      <p class="body" [id]="bodyId">{{ body() }}</p>

      @if (code(); as detail) {
        <p class="code">{{ detail }}</p>
      }

      <div class="actions">
        <button type="button" class="btn btn--primary" (click)="primary.emit()">
          {{ primaryLabel() }}
        </button>
        @if (secondaryLabel(); as label) {
          <button type="button" class="btn btn--ghost" (click)="secondary.emit()">
            {{ label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(5, 5, 5, 0.72);
        backdrop-filter: blur(3px);
        animation: scrim-in var(--nx-d-fast) var(--nx-ease-out) both;
      }

      .dialog {
        width: 460px;
        max-width: 100%;
        padding: 30px 30px 26px;
        background: var(--nx-surface-2);
        border: 1px solid var(--nx-line-strong);
        border-radius: var(--nx-r-4);
        box-shadow: var(--nx-elev-3);
        animation: dialog-in var(--nx-d-base) var(--nx-ease-out) both;
      }

      .chip {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        border-radius: var(--nx-r-3);
        background: var(--tone-fill);
        color: var(--tone);
      }

      .title {
        margin: 22px 0 0;
        font-family: var(--nx-font-display);
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.2px;
        line-height: 1.25;
        color: var(--nx-text);
      }

      .body {
        margin: 12px 0 0;
        font-family: var(--nx-font-ui);
        font-size: 13.5px;
        line-height: 20.9px;
        color: var(--nx-text-mute);
      }

      /* Código técnico do erro: útil pro suporte, irrelevante pro atleta —
         por isso mono, apagado e no fim, nunca no lugar da explicação. */
      .code {
        margin: 20px 0 0;
        padding: 9px 12px;
        background: var(--nx-surface-0);
        border: 1px solid var(--nx-line);
        border-radius: var(--nx-r-2);
        font-family: var(--nx-font-mono);
        font-size: 11px;
        letter-spacing: 0.44px;
        color: var(--nx-text-dim);
        overflow-wrap: anywhere;
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-top: 16px;
      }

      .btn {
        flex: 1;
        min-height: 46px;
        padding: 1px 6px;
        border-radius: var(--nx-r-3);
        font-family: var(--nx-font-display);
        font-size: 14px;
        cursor: pointer;
        transition:
          background var(--nx-d-fast) var(--nx-ease-out),
          border-color var(--nx-d-fast) var(--nx-ease-out);
      }

      .btn--primary {
        background: var(--nx-orange-500);
        border: 1px solid var(--nx-orange-500);
        color: var(--nx-text-on-orange);
        font-weight: 700;
      }

      .btn--primary:hover {
        background: var(--nx-orange-400);
        border-color: var(--nx-orange-400);
      }

      .btn--ghost {
        background: none;
        border: 1px solid var(--nx-line-strong);
        color: var(--nx-text);
        font-weight: 600;
      }

      .btn--ghost:hover {
        background: var(--nx-surface-1);
      }

      @keyframes scrim-in {
        from {
          opacity: 0;
        }
      }

      @keyframes dialog-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
      }

      @media (max-width: 520px) {
        .dialog {
          padding: 24px 20px 20px;
        }

        .actions {
          flex-direction: column;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host,
        .dialog {
          animation: none;
        }
      }
  `,
  host: {
    '(keydown)': 'onKeydown($event)',
    '[class.nx-tone-info]': 'tone() === "info"',
    '[class.nx-tone-success]': 'tone() === "success"',
    '[class.nx-tone-error]': 'tone() === "error"',
    '[class.nx-tone-warning]': 'tone() === "warning"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxBlockingDialogComponent implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  readonly tone = input<NxFeedbackTone>('error');
  /** `alertdialog` (default) anuncia com urgência — certo para erro que
   *  interrompe. Decisão informada, como a regra de horário de pico, usa
   *  `dialog`. */
  readonly role = input<'alertdialog' | 'dialog'>('alertdialog');
  /** Renomeado de `title` pra não virar atributo HTML nativo (tooltip). */
  readonly heading = input.required<string>();
  readonly body = input.required<string>();
  /** Código técnico do erro, se houver — o atleta repassa isso ao suporte. */
  readonly code = input<string | null>(null);
  readonly primaryLabel = input('Tentar novamente');
  readonly secondaryLabel = input<string | null>(null);
  /** Por padrão é bloqueante: Esc não fecha, porque o fluxo exige uma escolha. */
  readonly dismissible = input(false);

  readonly primary = output<void>();
  readonly secondary = output<void>();
  readonly dismissed = output<void>();

  protected readonly titleId = `nx-dialog-title-${nextId++}`;
  protected readonly bodyId = `nx-dialog-body-${nextId++}`;

  constructor() {
    document.body.style.overflow = 'hidden';
    afterNextRender(() => {
      this.focusable()[0]?.focus();
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.previouslyFocused?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.dismissible()) {
      event.preventDefault();
      this.dismissed.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    // Prende o Tab no diálogo: sem isso o foco escapa pra tela de fundo, que
    // está inerte visualmente mas continua alcançável pelo teclado.
    const items = this.focusable();
    if (items.length === 0) {
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
  }
}
