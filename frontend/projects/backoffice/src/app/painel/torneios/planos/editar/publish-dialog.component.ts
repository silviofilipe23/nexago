import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { IconComponent } from '../../../ui/icon.component';
import { addDays, dayLabel, type PlanDiff } from '../data/tournament-plans';
import { SegComponent } from '../ui/seg.component';

export interface PublishChoice {
  /** `null` = agora. */
  effectiveFrom: string | null;
}

/**
 * Tela 03 · Publicar alterações: o diff da versão, agora ou agendado. Os contadores de
 * eventos/propostas do protótipo ficam de fora: a contratação ainda não existe.
 */
@Component({
  selector: 'bo-publish-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, IconComponent, SegComponent],
  template: `
    <bo-confirm-dialog
      size="md"
      [open]="open()"
      title="Publicar alterações"
      [description]="subtitle()"
      [confirmLabel]="when() === 'agora' ? 'Publicar agora' : 'Agendar'"
      [confirmDisabled]="when() === 'agendar' && !dateOk()"
      [busy]="busy()"
      [error]="error()"
      (confirmed)="confirm()"
      (dismissed)="dismissed.emit()"
    >
      <div class="diff" role="table" aria-label="Alterações">
        @for (d of diffs(); track d.label) {
          <div class="row" role="row">
            <span class="k" role="cell">{{ d.label }}</span>
            <s role="cell">{{ d.before }}</s>
            <bo-icon name="chevron-right" [size]="12" />
            <b role="cell">{{ d.after }}</b>
          </div>
        }
      </div>

      <div class="when">
        <div class="col">
          <span class="lbl">Quando</span>
          <bo-seg label="Quando" [options]="whenOptions" [value]="when()" (valueChange)="when.set($event)" />
        </div>
        @if (when() === 'agendar') {
          <label class="col">
            <span class="lbl">Vale para contratações a partir de</span>
            <input type="date" class="bo-input" [min]="minDay()" [value]="date()" (input)="date.set(value($event))" [attr.aria-invalid]="!dateOk()" />
          </label>
        }
      </div>

      <p class="impact">
        <bo-icon name="check" [size]="14" />
        @if (when() === 'agora') {
          Vale a partir de agora. A contratação de planos ainda não está no app, então nenhum evento é afetado.
        } @else if (fromVersion() === 0) {
          O plano aparece para o organizador a partir de {{ dateLabel() }}.
        } @else {
          Até {{ dateLabel() }} segue valendo a v{{ fromVersion() }}. Eventos já contratados manterão o preço e o escopo originais.
        }
      </p>
    </bo-confirm-dialog>
  `,
  styles: `
    .diff { border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); overflow: hidden; margin-bottom: 18px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 130px) 14px minmax(0, 130px); align-items: center; gap: 8px; padding: 10px 14px; font-size: 12.5px; }
    .row + .row { border-top: 1px solid var(--nx-line); }
    .k { color: var(--nx-text-mute); }
    s { font-family: var(--nx-font-mono); color: var(--nx-text-dim); text-align: right; overflow-wrap: anywhere; }
    .row bo-icon { color: var(--nx-text-dim); display: inline-flex; }
    b { font-family: var(--nx-font-mono); color: var(--nx-orange-500); overflow-wrap: anywhere; }
    .when { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
    .col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .impact { margin: 16px 0 0; display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5; color: var(--nx-text-dim); }
    .impact bo-icon { color: var(--nx-win); flex: none; margin-top: 2px; }
    @media (max-width: 560px) {
      .when { grid-template-columns: minmax(0, 1fr); }
      .row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .row bo-icon { display: none; }
    }
  `,
})
export class PublishDialogComponent {
  readonly open = input(false);
  readonly planName = input.required<string>();
  /** Versão publicada hoje (0 = plano novo). */
  readonly fromVersion = input.required<number>();
  readonly diffs = input.required<PlanDiff[]>();
  readonly today = input.required<string>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly publish = output<PublishChoice>();
  readonly dismissed = output<void>();

  protected readonly whenOptions = [['agora', 'Agora'], ['agendar', 'Agendar']] as const;
  protected readonly when = signal<'agora' | 'agendar'>('agora');
  protected readonly minDay = computed(() => addDays(this.today(), 1));
  protected readonly date = signal('');
  protected readonly dateOk = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(this.date()) && this.date() >= this.minDay());
  protected readonly dateLabel = computed(() => (this.dateOk() ? dayLabel(this.date()) : 'a data'));
  protected readonly subtitle = computed(() =>
    this.fromVersion() === 0
      ? `${this.planName()} · primeira publicação (v1)`
      : `${this.planName()} · v${this.fromVersion()} → v${this.fromVersion() + 1}`,
  );

  constructor() {
    // Cada abertura começa em "Agora", com o 1º do mês seguinte sugerido para agendar.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.when.set('agora');
          const [y, m] = this.today().split('-').map(Number);
          const first = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
          this.date.set(first > this.today() ? first : this.minDay());
        });
      }
    });
  }

  protected confirm(): void {
    this.publish.emit({ effectiveFrom: this.when() === 'agendar' && this.dateOk() ? this.date() : null });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
