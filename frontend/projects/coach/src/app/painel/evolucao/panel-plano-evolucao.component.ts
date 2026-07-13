import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
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
  { title: 'Melhorar saque', deadline: '15/08/2026', pct: 65, notes: 'Evoluiu de 6.0 para 7.0 nas últimas duas avaliações.' },
  { title: 'Aumentar impulsão', deadline: '01/09/2026', pct: 40, notes: 'Programa de força iniciado com a preparadora física.' },
  { title: 'Melhorar recepção', deadline: '30/07/2026', pct: 90, notes: 'Já é o fundamento mais forte da atleta — quase concluído.' },
];

/** Plano de evolução (protótipo TrPlanoEvolucaoScreen) — tela mock: dado de exemplo fixo,
 *  sem Firestore. Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-plano-evolucao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, ProgressBarComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Plano de evolução" subtitle="Ana Beatriz · 3 objetivos ativos">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/plano-evolucao/novo">
          <co-icon name="plus" [size]="14" />
          Novo objetivo
        </a>
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
      grid-template-columns: repeat(3, 1fr);
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
export class PanelPlanoEvolucaoComponent {
  protected readonly goals = GOALS;
}
