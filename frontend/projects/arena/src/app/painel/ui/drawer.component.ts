import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Painel lateral deslizante (protótipo ArDrawer): scrim + painel projetado.
 *  Fecha no scrim, no X ou em Escape.
 *
 *  `side` existe porque o drawer nasceu à direita (detalhe de registro) e a
 *  navegação precisa vir da esquerda. O default continua `'right'` para não
 *  mexer em quem já usa. */
@Component({
  selector: 'ar-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Nada de @HostListener: `frontend/.claude/CLAUDE.md` manda pôr binding de host
  // aqui. Escape e Tab escutam no proprio host, nao no document -- o painel recebe
  // foco ao abrir, entao o teclado ja esta dentro quando as teclas chegam.
  host: {
    '(keydown.escape)': 'onEscape()',
    '(keydown.tab)': 'onTab($event)',
    '(keydown.shift.tab)': 'onTab($event)',
  },
  template: `
    <div class="scrim" [class.left]="side() === 'left'" (click)="close.emit()">
      <div
        #panel
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="ariaLabel() || null"
        tabindex="-1"
        (click)="$event.stopPropagation()"
      >
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: flex-end;
      animation: ar-scrim-in 180ms var(--nx-ease-out);
    }

    .scrim.left {
      justify-content: flex-start;
    }

    .panel {
      width: 100%;
      max-width: 420px;
      height: 100%;
      overflow-y: auto;
      background: var(--nx-surface-0);
      border-left: 1px solid var(--nx-line-strong);
      padding: 28px 24px;
      box-shadow: -24px 0 64px rgba(0, 0, 0, 0.5);
      animation: ar-drawer-in 240ms var(--nx-ease-out);
      box-sizing: border-box;
    }

    .panel:focus {
      outline: none;
    }

    .scrim.left .panel {
      border-left: none;
      border-right: 1px solid var(--nx-line-strong);
      box-shadow: 24px 0 64px rgba(0, 0, 0, 0.5);
      animation-name: ar-drawer-in-left;
    }

    @keyframes ar-scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes ar-drawer-in {
      from {
        transform: translateX(100%);
      }
    }

    @keyframes ar-drawer-in-left {
      from {
        transform: translateX(-100%);
      }
    }
  `,
})
export class DrawerComponent implements OnDestroy {
  readonly close = output<void>();
  readonly side = input<'left' | 'right'>('right');
  readonly ariaLabel = input('');

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly openedBy = this.host.nativeElement.ownerDocument.activeElement;

  constructor() {
    effect(() => this.panel().nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (this.openedBy instanceof HTMLElement && this.openedBy.isConnected) {
      this.openedBy.focus();
    }
  }

  protected onEscape(): void {
    this.close.emit();
  }

  /** Prisão de foco: Tab no último volta pro primeiro e Shift+Tab no primeiro
   *  vai pro último, para o teclado não escapar para a página atrás do scrim. */
  protected onTab(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    const focusables = Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = this.host.nativeElement.ownerDocument.activeElement;

    if (keyEvent.shiftKey && (active === first || active === this.panel().nativeElement)) {
      keyEvent.preventDefault();
      last.focus();
    } else if (!keyEvent.shiftKey && active === last) {
      keyEvent.preventDefault();
      first.focus();
    }
  }
}
