import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { TierPillComponent } from '../../niveis-regras/ui/tier-pill.component';
import { brl } from '../../comissoes/data/commission';
import { roiTone } from '../../data/squad-program';
import { roiLabel } from '../../embaixadores/data/ambassador';
import { costInsight, roiBarPct, type TierSummary } from '../data/overview';

/** "ROI por perfil": um nível por linha, do maior ROI para o menor, e o destaque de custo por conversão. */
@Component({
  selector: 'bo-tier-roi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, TierPillComponent, IconComponent, RouterLink],
  template: `
    <bo-panel-card title="ROI por perfil">
      <a card-actions class="action" routerLink="/painel/squad/embaixadores">Ver detalhes</a>
      @if (summaries().length === 0) {
        <p class="empty">Os números aparecem quando o primeiro embaixador converter.</p>
      } @else {
        <div class="table" role="table" aria-label="ROI por perfil">
          <div class="row head" role="row">
            <span role="columnheader">Perfil</span>
            <span role="columnheader">Qtd</span>
            <span role="columnheader">Conv.</span>
            <span role="columnheader">Receita</span>
            <span role="columnheader" title="Comissões + kit. Inscrições gratuitas, cachês e eventos ainda sem fonte.">Custo</span>
            <span role="columnheader">ROI</span>
          </div>
          @for (s of summaries(); track s.tier) {
            <div class="row" role="row">
              <span role="cell"><bo-tier-pill [tier]="s.tier" /></span>
              <span role="cell" class="mono">{{ s.count }}</span>
              <span role="cell" class="mono">{{ s.conversions }}</span>
              <span role="cell" class="mono">{{ money(s.revenueCents) }}</span>
              <span role="cell" class="mono mute">{{ money(s.costCents) }}</span>
              <span role="cell" class="roi" [class]="'roi ' + tone(s)">
                <b>{{ roi(s) }}</b>
                <span class="bar" aria-hidden="true"><i [style.width.%]="bar(s)"></i></span>
              </span>
            </div>
          }
        </div>
        @if (insight(); as i) {
          <p class="insight"><bo-icon name="trend-up" [size]="16" /><span><b>{{ i.lead }}</b>{{ i.rest }}</span></p>
        }
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .action { font-size: 12.5px; font-weight: 600; color: var(--nx-orange-500); text-decoration: none; }
    .action:hover { text-decoration: underline; }
    .empty { margin: 8px 0; font-size: 13px; color: var(--nx-text-dim); }
    .table { overflow-x: auto; }
    .row { display: grid; grid-template-columns: minmax(150px, 1.3fr) 0.5fr 0.6fr 1fr 0.9fr minmax(130px, 1.5fr); gap: 14px; align-items: center; min-width: 600px; height: 50px; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    .row.head { height: auto; padding-bottom: 10px; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); font-size: 13px; font-weight: 500; }
    .mute { color: var(--nx-text-mute); }
    .roi { display: flex; align-items: center; gap: 10px; }
    .roi b { font-family: var(--nx-font-mono); font-size: 13px; font-weight: 700; min-width: 38px; }
    .bar { flex: 1; height: 5px; border-radius: 99px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 99px; background: var(--nx-orange-500); }
    .roi.green b { color: var(--nx-win); }
    .roi.green .bar i { background: var(--nx-win); }
    .roi.red b { color: var(--nx-live); }
    .roi.red .bar i { background: var(--nx-live); }
    .roi.none b { color: var(--nx-text-dim); }
    .insight { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0 0; padding: 12px 14px; border-radius: var(--nx-r-3); background: var(--nx-orange-tint); color: var(--nx-text); font-size: 12.5px; line-height: 1.5; }
    .insight bo-icon { color: var(--nx-orange-500); flex: none; }
  `,
})
export class TierRoiCardComponent {
  readonly summaries = input.required<TierSummary[]>();
  protected readonly insight = computed(() => costInsight(this.summaries()));

  protected money(cents: number): string {
    return brl(cents, false);
  }

  protected roi(s: TierSummary): string {
    return roiLabel(s.roi);
  }

  protected tone(s: TierSummary): string {
    return roiTone(s.roi);
  }

  protected bar(s: TierSummary): number {
    return roiBarPct(s.roi, this.summaries());
  }
}
