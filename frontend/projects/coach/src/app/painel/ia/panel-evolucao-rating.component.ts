import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

const RATING_SERIES = [
  { label: 'Jan', value: 1720 },
  { label: 'Fev', value: 1780 },
  { label: 'Mar', value: 1810 },
  { label: 'Abr', value: 1865 },
  { label: 'Mai', value: 1920 },
  { label: 'Jun', value: 1975 },
  { label: 'Jul', value: 2015 },
];

interface RatingChange {
  title: string;
  date: string;
  rating: string;
  positive: boolean;
}

const CHANGES: RatingChange[] = [
  { title: '+42 · Vitória na Etapa Garden', date: '10/07', rating: '2.015', positive: true },
  { title: '+55 · Promoção de categoria', date: '14/06', rating: '1.973', positive: true },
  { title: '-18 · Derrota na semifinal', date: '22/05', rating: '1.918', positive: false },
];

/** Evolução do rating (protótipo TrEvolucaoRatingScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-evolucao-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LineChartComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Evolução do rating" subtitle="Ana Beatriz · Linha do tempo completa" />

      <div class="body">
        <co-panel-card title="Rating NexaGO" kicker="Últimos 7 meses">
          <co-line-chart [data]="ratingSeries" [width]="500" [height]="170" />
        </co-panel-card>
        <co-panel-card title="Motivo das mudanças">
          @for (c of changes; track c.date) {
            <co-row [title]="c.title" [sub]="c.date" [last]="$last">
              <span row-trailing class="rating" [class.negative]="!c.positive">{{ c.rating }}</span>
            </co-row>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    .rating {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-win);
    }
    .rating.negative {
      color: var(--nx-live);
    }
  `,
})
export class PanelEvolucaoRatingComponent {
  protected readonly ratingSeries = RATING_SERIES;
  protected readonly changes = CHANGES;
}
