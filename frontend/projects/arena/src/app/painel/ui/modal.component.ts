import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { PersonPhotoService } from './person-photo.service';

/** Overlay de modal genérico (protótipo ArModal): scrim + painel centralizado, conteúdo projetado. Fecha no scrim, no X ou em Escape.
 *  `size="lg"` abre o painel até 600px, para formulários com duas colunas (ex.: convite de professor);
 *  `size="xl"` até 980px e sem padding, para formulário com resumo ao lado (contrato do CRM).
 *  No celular (≤ sm) qualquer tamanho vira bottom-sheet de largura total, com o corpo rolando
 *  e o rodapé `.modal-actions`/`.confirm-actions`/`.actions` final (filho direto do conteúdo) preso embaixo. */
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
    @use 'breakpoints' as ar;

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

    /* Celular: bottom-sheet. Largura total (o 24px de respiro do scrim comia
       ~13% de uma tela de 360px), altura até quase o topo, cantos arredondados
       só em cima e folga para a barra de gestos do iPhone. O corpo continua
       rolando no próprio .panel. */
    @include ar.below(sm) {
      .scrim {
        place-items: end stretch;
        padding: 12px 0 0;
      }

      .panel,
      .panel.lg,
      .panel.xl {
        max-width: none;
        max-height: calc(100dvh - 12px);
        border-bottom: none;
        border-radius: var(--nx-r-4) var(--nx-r-4) 0 0;
        overscroll-behavior: contain;
        animation-name: ar-sheet-in;
      }

      .panel,
      .panel.lg {
        padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
      }

      .panel.xl {
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      /* Rodapé de ações sempre à vista: o conteúdo é projetado, então só
         ::ng-deep alcança -- e fica preso ao filho DIRETO do painel deste
         modal, nunca vaza para o resto da tela. Os consumidores já usam
         estas classes (dezenas de modais); '.actions' é nome genérico, então só
         conta quando é o último elemento do modal. Quem não usa nenhuma
         continua rolando o rodapé junto, como antes. */
      .panel ::ng-deep > .modal-actions,
      .panel ::ng-deep > .confirm-actions,
      .panel ::ng-deep > .actions:last-child {
        position: sticky;
        bottom: 0;
        z-index: 1;
        flex-wrap: wrap;
        padding-block: 12px;
        background: var(--nx-surface-0);
        border-top: 1px solid var(--nx-line);
      }
    }

    @keyframes ar-scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes ar-sheet-in {
      from {
        transform: translateY(24px);
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
