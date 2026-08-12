import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  output,
  signal,
} from '@angular/core';
import { LGPD_CHECKBOX_LABEL, LGPD_TERM_PARAGRAPHS, LGPD_TERM_TITLE } from './lgpd-term';

const FOCUSABLE =
  'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Dialog do termo LGPD para os aceites rápidos de convite (painel/agenda), onde
 *  não existe um formulário de inscrição pra abrigar o checkbox inline. Segue o
 *  padrão declarativo do `nx-blocking-dialog`: o chamador renderiza num `@if` e
 *  reage a `confirmed`/`cancelled`. */
@Component({
  selector: 'app-lgpd-consent-dialog',
  template: `
    <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title">
      <h2 class="title">{{ title }}</h2>

      <div class="term">
        @for (paragraph of paragraphs; track $index) {
          <p>{{ paragraph }}</p>
        }
      </div>

      <label class="check">
        <input
          type="checkbox"
          [checked]="accepted()"
          (change)="accepted.set($any($event.target).checked)"
        />
        <span>{{ label }}</span>
      </label>

      <div class="actions">
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="!accepted()"
          (click)="confirmed.emit()"
        >
          Aceitar e continuar
        </button>
        <button type="button" class="btn btn--ghost" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: safe center;
      justify-content: center;
      box-sizing: border-box;
      padding: max(16px, env(safe-area-inset-top, 0px))
        max(16px, env(safe-area-inset-right, 0px))
        max(16px, env(safe-area-inset-bottom, 0px))
        max(16px, env(safe-area-inset-left, 0px));
      overflow-x: hidden;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      background: rgba(5, 5, 5, 0.72);
      backdrop-filter: blur(3px);
    }

    /* Era largura fixa + max-width: 100% num host em grid: a porcentagem resolvia
       contra uma track que a própria largura de 520px tinha medido, então no celular
       o diálogo continuava com 520px e cortava texto e botões à direita. Com o host
       em flex e min() a porcentagem cai na caixa do host, que é definida — mesmo
       padrão do nx-blocking-dialog. dvh porque a barra do navegador móvel encolhe o
       viewport visível e 100vh deixava os botões atrás dela. */
    .dialog {
      box-sizing: border-box;
      width: min(520px, 100%);
      max-height: min(100%, calc(100dvh - 32px));
      margin: auto;
      display: flex;
      flex-direction: column;
      padding: 26px 26px 22px;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      box-shadow: var(--nx-elev-3);
    }

    .title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.2px;
      line-height: 1.3;
      color: var(--nx-text);
    }

    /* O termo encolhe antes de tudo quando a tela é baixa (é ele que rola), mas
       com um piso legível: abaixo disso quem rola é o diálogo, senão em tela
       muito baixa o termo virava uma fresta e o "Cancelar" saía embaixo. */
    .term {
      flex: 0 1 auto;
      min-height: 96px;
      margin-top: 14px;
      padding: 12px 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .term p {
      margin: 0 0 10px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 20px;
      color: var(--nx-text-mute);
    }

    .term p:last-child {
      margin-bottom: 0;
    }

    .check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 14px;
      cursor: pointer;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 19.5px;
      color: var(--nx-text);
    }

    .check input {
      flex: none;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      accent-color: var(--nx-orange-500);
      cursor: pointer;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }

    .btn {
      box-sizing: border-box;
      flex: 1 1 140px;
      min-width: 0;
      min-height: 46px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      font-family: var(--nx-font-display);
      font-size: 14px;
      line-height: 1.25;
      white-space: normal;
      text-align: center;
      cursor: pointer;
    }

    .btn--primary {
      background: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }

    .btn--primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn--ghost {
      background: none;
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-weight: 600;
    }

    @media (max-width: 520px) {
      .dialog {
        padding: 22px 16px 18px;
        border-radius: var(--nx-r-3);
      }

      .actions {
        flex-direction: column;
      }

      .btn {
        flex: 1 1 auto;
        width: 100%;
      }
    }
  `,
  host: {
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LgpdConsentDialogComponent implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly accepted = signal(false);
  protected readonly title = LGPD_TERM_TITLE;
  protected readonly paragraphs = LGPD_TERM_PARAGRAPHS;
  protected readonly label = LGPD_CHECKBOX_LABEL;

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
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelled.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    // Prende o Tab no diálogo (mesmo racional do nx-blocking-dialog).
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
