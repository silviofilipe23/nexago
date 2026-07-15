import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Cabeçalho + barra de progresso compartilhados pelos wizards de Torneio/Liga/Etapa. */
@Component({
  selector: 'og-wizard-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
            <button type="button" class="og-ghost-btn" (click)="back.emit()">Voltar</button>
          }
          <button type="button" class="og-ghost-btn">Salvar rascunho</button>
          <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="cta.emit()">{{ ctaLabel() }}</button>
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
  `,
})
export class OgWizardShellComponent {
  readonly flow = input.required<string>();
  readonly total = input.required<number>();
  readonly step = input.required<number>();
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly ctaLabel = input('Continuar');

  readonly cta = output<void>();
  readonly back = output<void>();

  protected stepsArray(): number[] {
    return Array.from({ length: this.total() }, (_, i) => i + 1);
  }
}
