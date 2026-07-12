import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { averageScore, latestTwoByAthlete } from './evaluation-stats';
import { EvaluationsService } from './evaluations.service';

@Component({
  selector: 'co-panel-avaliacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    IconComponent,
    KpiCardComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Avaliações" subtitle="Histórico de avaliações da equipe">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/avaliacoes/nova">
          <co-icon name="plus" [size]="14" />
          Nova avaliação
        </a>
      </co-page-header>

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Avaliações no mês" [value]="evaluationsThisMonthLabel()" [icon]="'radar'" />
          <co-kpi-card label="Média geral" [value]="averageLabel()" deltaTone="flat" />
        </div>

        <co-panel-card title="Últimas avaliações por atleta">
          @for (row of rows(); track row.athleteUid; let last = $last) {
            <co-row [title]="row.displayName" [sub]="'Avaliado em ' + row.date" [last]="last">
              <co-athlete-avatar row-avatar [initials]="row.initials" [size]="34" [status]="row.status" />
              <div row-trailing class="score-cell">
                <span class="score">{{ row.average.toFixed(1) }}</span>
                @if (row.delta !== null) {
                  <span class="delta" [class.negative]="row.delta < 0">{{ row.delta >= 0 ? '+' : '' }}{{ row.delta.toFixed(1) }}</span>
                }
              </div>
            </co-row>
          } @empty {
            <p class="empty">Nenhuma avaliação registrada ainda.</p>
          }
        </co-panel-card>
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
    .score-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .delta {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-win);
    }
    .delta.negative {
      color: var(--nx-live);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelAvaliacoesComponent {
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly evaluations = computed(() => this.evaluationsService.evaluations());

  protected readonly evaluationsThisMonthLabel = computed(() => {
    const prefix = new Date().toISOString().slice(0, 7);
    return String(this.evaluations().filter((e) => e.date.startsWith(prefix)).length);
  });

  protected readonly rows = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const roster = this.athletesService.roster().filter((a) => !activeId || a.squadId === activeId);
    const byAthlete = latestTwoByAthlete(this.evaluations());
    return roster
      .map((a) => {
        const entry = byAthlete.get(a.athleteUid);
        if (!entry) {
          return null;
        }
        const average = averageScore(entry.latest.scores);
        const delta = entry.previous ? average - averageScore(entry.previous.scores) : null;
        return {
          athleteUid: a.athleteUid,
          displayName: a.displayName,
          initials: a.initials,
          status: a.status,
          date: entry.latest.date,
          average,
          delta,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  });

  protected readonly averageLabel = computed(() => {
    const list = this.rows();
    if (list.length === 0) {
      return '—';
    }
    return (list.reduce((sum, r) => sum + r.average, 0) / list.length).toFixed(1);
  });
}
