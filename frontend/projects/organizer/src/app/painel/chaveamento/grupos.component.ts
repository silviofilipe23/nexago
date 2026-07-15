import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OG_GRUPOS } from '../data/mock-data';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

/** Fase de grupos — classificação por vitórias/sets/pontos, com destaque para quem avança. */
@Component({
  selector: 'og-grupos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, ChaveamentoSubnavComponent],
  template: `
    <og-page-header title="Fase de grupos" subtitle="Liga Municipal de Beach Tennis · categoria Open Misto · rodada 3 de 3">
      <button type="button" class="og-mini-btn"><og-icon name="whistle" [size]="14" />Sortear grupos</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary">Fechar grupos & gerar chave</button>
    </og-page-header>

    <div class="og-content">
      <og-chaveamento-subnav active="grupos" />
      <div class="og-grupos-grid">
        @for (g of grupos; track g.id) {
          <og-card kicker="Fase de grupos" [title]="'Grupo ' + g.id" pad="0">
            <div class="og-grupos-head">
              <span style="flex:1">Dupla</span>
              <span style="width:30px;text-align:center">V</span>
              <span style="width:30px;text-align:center">D</span>
              <span style="width:46px;text-align:center">Sets</span>
              <span style="width:34px;text-align:center">Pts</span>
            </div>
            @for (t of g.teams; track t.name; let i = $index) {
              <div class="og-grupos-row" [class.classified]="t.classified">
                <span class="og-grupos-pos">{{ i + 1 }}</span>
                <span class="og-grupos-name" [class.classified]="t.classified">{{ t.name }}</span>
                <span class="og-grupos-cell">{{ t.v }}</span>
                <span class="og-grupos-cell dim">{{ t.d }}</span>
                <span class="og-grupos-cell dim">{{ t.sets }}</span>
                <span class="og-grupos-cell pts">{{ t.pts }}</span>
              </div>
            }
            <div class="og-grupos-legend">
              <span class="og-grupos-legend-dot"></span>
              <span>Classificado(a) para as eliminatórias</span>
            </div>
          </og-card>
        }
      </div>
    </div>
  `,
  styles: `
    .og-grupos-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-grupos-head {
      display: flex;
      gap: 10px;
      padding: 12px 18px;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-grupos-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-grupos-row.classified {
      background: var(--nx-orange-tint);
    }
    .og-grupos-pos {
      width: 16px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }
    .og-grupos-name {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 500;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-grupos-name.classified {
      font-weight: 700;
      color: var(--nx-orange-500);
    }
    .og-grupos-cell {
      width: 30px;
      text-align: center;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text);
    }
    .og-grupos-cell.dim {
      color: var(--nx-text-dim);
    }
    .og-grupos-cell.pts {
      width: 34px;
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-grupos-legend {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-grupos-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.4);
    }
  `,
})
export class GruposComponent {
  protected readonly grupos = OG_GRUPOS;
}
