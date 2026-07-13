import { ChangeDetectionStrategy, Component } from '@angular/core';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ProgressBarComponent, type ProgressTone } from '../ui/progress-bar.component';

interface CategoryParticipation {
  label: string;
  sub: string;
  pct: number;
  tone: ProgressTone;
}

const RATING_SERIES = [
  { label: 'Fev', value: 1780 },
  { label: 'Mar', value: 1820 },
  { label: 'Abr', value: 1865 },
  { label: 'Mai', value: 1902 },
  { label: 'Jun', value: 1940 },
  { label: 'Jul', value: 1978 },
];

const CATEGORY_PARTICIPATION: CategoryParticipation[] = [
  { label: 'Intermediário', sub: '12 atletas', pct: 88, tone: 'green' },
  { label: 'Open', sub: '6 atletas', pct: 94, tone: 'orange' },
  { label: 'Iniciante', sub: '6 atletas', pct: 62, tone: 'yellow' },
];

/** Estatísticas da equipe (protótipo TrEstatisticasScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-estatisticas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiCardComponent, LineChartComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, ProgressBarComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Estatísticas da equipe" subtitle="Equipe Adulto Masculino · Visão geral" />

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Treinos realizados" value="42" delta="86% de participação" />
          <co-kpi-card label="Vitórias" value="18" delta="72% de aproveitamento" deltaTone="green" />
          <co-kpi-card label="Derrotas" value="7" deltaTone="red" />
          <co-kpi-card label="Pódios" value="9" delta="Últimos 12 meses" deltaTone="flat" />
        </div>
        <div class="grid">
          <co-panel-card title="Rating médio da equipe" kicker="Últimos 6 meses">
            <co-line-chart [data]="ratingSeries" [width]="420" [height]="160" />
          </co-panel-card>
          <co-panel-card title="Participação por categoria">
            @for (c of categoryParticipation; track c.label) {
              <div class="cat-row">
                <div class="cat-label">{{ c.label }}<span class="cat-sub">{{ c.sub }}</span></div>
                <co-progress-bar [pct]="c.pct" [tone]="c.tone" />
              </div>
            }
          </co-panel-card>
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .cat-row {
      margin-bottom: 14px;
    }
    .cat-row:last-child {
      margin-bottom: 0;
    }
    .cat-label {
      display: flex;
      justify-content: space-between;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text);
      margin-bottom: 6px;
    }
    .cat-sub {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class PanelEstatisticasComponent {
  protected readonly ratingSeries = RATING_SERIES;
  protected readonly categoryParticipation = CATEGORY_PARTICIPATION;
}
