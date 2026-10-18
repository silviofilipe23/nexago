import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { TIER_LABELS } from '../../niveis-regras/data/squad-rules';
import type { PromotionView, StayView } from '../data/profile';

/**
 * Critérios da próxima promoção (tela 06): conversões com barra, ROI mínimo e o checklist manual.
 * No topo da escada (Pro, Captain) mostra o que mantém o contrato: ROI acima do limite.
 */
@Component({
  selector: 'bo-promotion-progress-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent],
  template: `
    <bo-panel-card [title]="title()">
      @if (promo(); as p) {
        <div class="count"><b>{{ p.conversions }}</b><span>de {{ p.min }} conversões</span></div>
        <span class="bar" aria-hidden="true"><i [style.width.%]="p.pct"></i></span>
      }
      <ul class="criteria">
        @for (c of view().criteria; track c.label) {
          <li>
            <span class="dot" [class.ok]="c.ok === true" [class.fail]="c.ok === false" [class.manual]="c.ok === null">
              @if (c.ok === true) {
                <bo-icon name="check" [size]="12" />
              } @else {
                <i></i>
              }
            </span>
            <span class="label">{{ c.label }}</span>
            <span class="value">{{ c.value }}</span>
          </li>
        }
      </ul>
      @if (stay(); as s) {
        @if (s.watch.length) {
          <p class="watch">Sinais de encerramento: {{ s.watch.join(' · ') }}.</p>
        }
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .count { display: flex; align-items: baseline; gap: 8px; }
    .count b { font-family: var(--nx-font-display); font-weight: 800; font-size: 30px; letter-spacing: -0.03em; }
    .count span { font-size: 13px; color: var(--nx-text-dim); }
    .bar { display: block; height: 8px; margin-top: 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 99px; background: var(--nx-orange-500); }
    .criteria { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    li { display: flex; align-items: center; gap: 10px; font-size: 13px; }
    .dot { width: 20px; height: 20px; flex: none; display: grid; place-items: center; border-radius: 99px; background: var(--nx-surface-2); color: var(--nx-text-dim); }
    .dot i { width: 5px; height: 5px; border-radius: 99px; background: currentColor; }
    .dot.ok { background: rgba(43, 209, 126, 0.14); color: var(--nx-win); }
    .dot.fail { background: rgba(255, 59, 48, 0.12); color: var(--nx-live); }
    .label { flex: 1; min-width: 0; }
    .value { font-size: 12px; color: var(--nx-text-dim); text-align: right; }
    .watch { margin: 14px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-dim); }
  `,
})
export class PromotionProgressCardComponent {
  readonly view = input.required<PromotionView | StayView>();

  protected readonly promo = computed(() => {
    const v = this.view();
    return v.kind === 'promotion' ? v : null;
  });
  protected readonly stay = computed(() => {
    const v = this.view();
    return v.kind === 'stay' ? v : null;
  });
  protected readonly title = computed(() => {
    const v = this.view();
    return v.kind === 'promotion'
      ? `Promoção · ${TIER_LABELS[v.from]} → ${TIER_LABELS[v.to]}`
      : `Permanência · ${TIER_LABELS[v.tier]}`;
  });
}
