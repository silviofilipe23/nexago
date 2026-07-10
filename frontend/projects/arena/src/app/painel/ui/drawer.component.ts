import { ChangeDetectionStrategy, Component, HostListener, output } from '@angular/core';

/** Painel lateral deslizante (protótipo ArDrawer): scrim + painel fixado à direita, conteúdo projetado. Fecha no scrim, no X ou em Escape. */
@Component({
  selector: 'ar-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="close.emit()">
      <div class="panel" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
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
  `,
})
export class DrawerComponent {
  readonly close = output<void>();

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close.emit();
  }
}
