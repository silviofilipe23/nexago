import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { ProgressBarComponent } from '../ui/progress-bar.component';

interface Goal {
  title: string;
  deadline: string;
  pct: number;
  notes: string;
}

const GOALS: Goal[] = [
  { title: 'Meta coletiva — 80% de presença', deadline: '31/07/2026', pct: 86, notes: 'Equipe já superou a meta neste mês.' },
  { title: 'Meta coletiva — 5 pódios no semestre', deadline: '31/12/2026', pct: 60, notes: '3 de 5 pódios conquistados até agora.' },
  { title: 'Ana Beatriz — rating 2.100', deadline: '30/09/2026', pct: 72, notes: 'Está em 2.015, faltam 85 pontos.' },
  { title: 'João Silva — disputar 6 torneios', deadline: '31/12/2026', pct: 50, notes: '3 de 6 torneios já confirmados.' },
];

/** Gestão de metas (protótipo TrGestaoMetasScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-gestao-metas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, ProgressBarComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Gestão de metas" subtitle="Individuais e coletivas">
        <button type="button" class="co-mini-btn co-mini-btn-primary">Nova meta</button>
      </co-page-header>

      <div class="body">
        @for (goal of goals; track goal.title) {
          <co-panel-card pad="sm">
            <div class="head">
              <div class="title">{{ goal.title }}</div>
              <co-pill [tone]="goal.pct >= 80 ? 'green' : 'orange'">{{ goal.pct }}%</co-pill>
            </div>
            <co-progress-bar [pct]="goal.pct" [tone]="goal.pct >= 80 ? 'green' : 'orange'" />
            <div class="deadline">Prazo · {{ goal.deadline }}</div>
            <p class="notes">{{ goal.notes }}</p>
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .deadline {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 10px;
    }
    .notes {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      margin: 8px 0 0;
      line-height: 1.4;
    }
  `,
})
export class PanelGestaoMetasComponent {
  protected readonly goals = GOALS;
}
