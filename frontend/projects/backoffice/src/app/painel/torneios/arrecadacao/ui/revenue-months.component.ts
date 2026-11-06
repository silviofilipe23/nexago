import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { signedMoney, type MonthBar } from '../data/tournament-revenue';

const BAR_MAX_PX = 130;

/** Barras do líquido por mês do torneio; o mês atual em laranja, mês negativo no chão em vermelho. */
@Component({
  selector: 'bo-revenue-months',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card title="Receita líquida por mês" kicker="Pela data do torneio">
      <div class="bars" role="img" [attr.aria-label]="ariaLabel()">
        @for (m of view(); track m.key) {
          <div class="col">
            <span class="value">{{ m.value }}</span>
            <div class="bar" [class.on]="m.current" [class.neg]="m.negative" [style.height.px]="m.height"></div>
            <span class="label">{{ m.label }}</span>
          </div>
        }
      </div>
    </bo-panel-card>
  `,
  styles: `
    .bars { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; align-items: end; height: 190px; padding-top: 8px; }
    .col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; min-width: 0; }
    .value { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); white-space: nowrap; }
    .bar { width: 100%; max-width: 54px; border-radius: 6px 6px 2px 2px; background: var(--nx-surface-2); }
    .bar.on { background: var(--nx-orange-500); }
    .bar.neg { background: var(--nx-live); }
    .label { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
  `,
})
export class RevenueMonthsComponent {
  readonly bars = input.required<readonly MonthBar[]>();

  protected readonly view = computed(() => {
    const max = Math.max(1, ...this.bars().map((b) => Math.abs(b.netCents)));
    return this.bars().map((b) => ({
      ...b,
      value: b.netCents ? signedMoney(b.netCents).replace(/,\d{2}$/, '') : '—',
      negative: b.netCents < 0,
      height: b.netCents ? Math.max(6, Math.round((Math.abs(b.netCents) / max) * BAR_MAX_PX)) : 3,
    }));
  });

  protected readonly ariaLabel = computed(
    () => `Receita líquida por mês: ${this.bars().map((b) => `${b.label} ${signedMoney(b.netCents)}`).join(', ')}`,
  );
}
