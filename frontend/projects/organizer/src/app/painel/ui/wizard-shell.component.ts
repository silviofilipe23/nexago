import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/** Cabeçalho + barra de progresso compartilhados pelos wizards de Torneio/Liga/Etapa.
 *  `ctaBusy` troca o CTA pra spinner + `ctaBusyLabel` e, quando `busyTitle` é informado,
 *  cobre o wizard com o overlay de processamento (publicar faz upload de capa + callable). */
@Component({
  selector: 'og-wizard-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NxProcessingOverlayComponent, NxSpinnerComponent],
  styles: `
    :host {
      display: block;
      position: relative;
    }
  `,
  template: `
    <div class="og-wizard-top">
      <div class="og-wizard-top-row">
        <div>
          <div class="og-wizard-flow">{{ flow() }} · Passo {{ step() }} de {{ total() }}</div>
          <h1 class="og-wizard-title">{{ title() }}</h1>
          @if (subtitle()) {
            <div class="og-wizard-subtitle">{{ subtitle() }}</div>
          }
        </div>
        <div class="og-page-header-actions">
          @if (step() > 1) {
            <button type="button" class="og-ghost-btn" [disabled]="ctaBusy()" (click)="back.emit()">Voltar</button>
          }
          @if (showDraft()) {
            <button type="button" class="og-ghost-btn" [disabled]="ctaBusy()" (click)="saveDraft.emit()">Salvar rascunho</button>
          }
          <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="ctaDisabled() || ctaBusy()" (click)="cta.emit()">
            @if (ctaBusy()) {
              <app-nx-spinner [size]="12" tone="dark" />
            }
            {{ ctaBusy() ? ctaBusyLabel() : ctaLabel() }}
          </button>
        </div>
      </div>
      <div class="og-wizard-progress">
        @for (i of stepsArray(); track i) {
          <span [class.done]="i < step()"></span>
        }
      </div>
    </div>
    <div class="og-wizard-body">
      <div class="og-wizard-col">
        <ng-content />
      </div>
    </div>
    @if (ctaBusy() && busyTitle(); as title) {
      <app-nx-processing-overlay [title]="title" [description]="busyDescription()" />
    }
  `,
})
export class OgWizardShellComponent {
  readonly flow = input.required<string>();
  readonly total = input.required<number>();
  readonly step = input.required<number>();
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly ctaLabel = input('Continuar');
  readonly ctaDisabled = input(false);
  readonly showDraft = input(true);
  /** Ação do CTA em andamento — troca rótulo/spinner e desabilita as demais ações. */
  readonly ctaBusy = input(false);
  readonly ctaBusyLabel = input('Salvando…');
  /** Título do overlay de processamento — informe pra cobrir o wizard em ações longas. */
  readonly busyTitle = input<string | null>(null);
  readonly busyDescription = input<string | null>(null);

  readonly cta = output<void>();
  readonly back = output<void>();
  readonly saveDraft = output<void>();

  protected stepsArray(): number[] {
    return Array.from({ length: this.total() }, (_, i) => i + 1);
  }
}
