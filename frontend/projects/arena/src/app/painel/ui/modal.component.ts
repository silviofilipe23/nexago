import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { PersonPhotoService } from './person-photo.service';

/** Overlay de modal genérico (protótipo ArModal): scrim + painel centralizado, conteúdo projetado. Fecha no scrim, no X ou em Escape.
 *  `size="lg"` abre o painel até 600px, para formulários com duas colunas (ex.: convite de professor);
 *  `size="xl"` até 980px e sem padding, para formulário com resumo ao lado (contrato do CRM). */
@Component({
  selector: 'ar-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <div class="scrim" (click)="close.emit()">
      <div class="panel" [class.lg]="size() === 'lg'" [class.xl]="size() === 'xl'" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
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
      display: grid;
      place-items: center;
      padding: 24px;
      animation: ar-scrim-in 180ms var(--nx-ease-out);
    }

    .panel {
      width: 100%;
      max-width: 440px;
      max-height: calc(100dvh - 48px);
      overflow-y: auto;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      padding: 24px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      animation: ar-panel-in 220ms var(--nx-ease-out);
    }

    .panel.lg {
      max-width: 600px;
    }

    .panel.xl {
      max-width: 980px;
      padding: 0;
    }

    @keyframes ar-scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes ar-panel-in {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(6px);
      }
    }
  `,
})
export class ModalComponent {
  readonly close = output<void>();
  readonly size = input<'md' | 'lg' | 'xl'>('md');

  private readonly photos = inject(PersonPhotoService);

  protected onEscape(): void {
    // Foto ampliada aberta de dentro do modal: o Escape é dela, não pode fechar o modal junto.
    if (this.photos.photo()) return;
    this.close.emit();
  }
}
