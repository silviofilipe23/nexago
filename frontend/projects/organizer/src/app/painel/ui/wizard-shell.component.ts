import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/** Cabeçalho + stepper compartilhados pelos wizards de Torneio/Liga/Etapa.
 *  `ctaBusy` troca o CTA pra spinner + `ctaBusyLabel` e, quando `busyTitle` é informado,
 *  cobre o wizard com o overlay de processamento (publicar faz upload de capa + callable).
 *  O stepper navega direto: passos até `unlockedUpTo` são clicáveis e emitem `stepSelected`. */
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
          <div class="og-wizard-flow">{{ flow() }} · Passo {{ step() }} de {{ steps().length }}</div>
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
      <nav class="og-wizard-steps" aria-label="Passos do wizard">
        @for (label of steps(); track $index) {
          <button
            type="button"
            class="og-wizard-step"
            [class.done]="$index + 1 <= step()"
            [class.current]="$index + 1 === step()"
            [disabled]="$index + 1 > unlockedUpTo() || ctaBusy()"
            [attr.aria-current]="$index + 1 === step() ? 'step' : null"
            [title]="label"
            (click)="stepSelected.emit($index + 1)"
          >
            <span class="og-wizard-step-bar"></span>
            <span class="og-wizard-step-label">{{ $index + 1 }}. {{ label }}</span>
          </button>
        }
      </nav>
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
  /** Rótulos curtos dos passos, em ordem — definem também o total. */
  readonly steps = input.required<readonly string[]>();
  readonly step = input.required<number>();
  /** Maior passo (1-based) liberado pra clique direto. `0` trava o stepper inteiro. */
  readonly unlockedUpTo = input(0);
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
  /** Passo escolhido no stepper (1-based). */
  readonly stepSelected = output<number>();
}
