import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RadarChartComponent } from '../ui/radar-chart.component';
import { SquadContextService } from '../ui/squad-context.service';
import { attendanceRate } from '../treinos/attendance-stats';
import { TrainingsService } from '../treinos/trainings.service';
import { FUNDAMENTALS, averageScore, latestTwoByAthlete } from '../avaliacoes/evaluation-stats';
import { EvaluationsService } from '../avaliacoes/evaluations.service';
import { AthletesService, type RosterAthlete } from './athletes.service';

/** Comparação manual entre 2 atletas (protótipos TrComparacaoScreen + TrDuplasScreen,
 *  unificados — ver docs/superpowers/specs/2026-07-13-coach-comparar-atletas-design.md).
 *  Sem rating/win rate/pódios (sem dado real) e sem sugestão automática de dupla. */
@Component({
  selector: 'co-panel-comparar-atletas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AthleteAvatarComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RadarChartComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Comparar atletas" subtitle="Escolha 2 atletas da equipe ativa" />

      <div class="body">
        @if (roster().length < 2) {
          <p class="empty">Adicione ao menos 2 atletas a esta equipe para comparar.</p>
        } @else {
          <div class="pickers">
            <select class="picker" [value]="athleteA()?.athleteUid ?? ''" (change)="selectAthleteA($any($event.target).value)">
              @for (a of roster(); track a.athleteUid) {
                <option [value]="a.athleteUid">{{ a.displayName }}</option>
              }
            </select>
            <select class="picker" [value]="athleteB()?.athleteUid ?? ''" (change)="selectAthleteB($any($event.target).value)">
              @for (a of roster(); track a.athleteUid) {
                <option [value]="a.athleteUid">{{ a.displayName }}</option>
              }
            </select>
          </div>

          <div class="grid">
            @if (athleteA(); as a) {
              <co-panel-card [title]="a.displayName" [kicker]="a.category || 'Sem categoria'">
                <div class="athlete-head">
                  <co-athlete-avatar [initials]="a.initials" [size]="56" [status]="a.status" />
                </div>
                @if (axesFor(a.athleteUid); as axes) {
                  <div class="radar-wrap"><co-radar-chart [axes]="axes" [size]="260" /></div>
                } @else {
                  <p class="empty">Sem avaliação registrada.</p>
                }
              </co-panel-card>
            }
            @if (athleteB(); as b) {
              <co-panel-card [title]="b.displayName" [kicker]="b.category || 'Sem categoria'">
                <div class="athlete-head">
                  <co-athlete-avatar [initials]="b.initials" [size]="56" [status]="b.status" />
                </div>
                @if (axesFor(b.athleteUid); as axes) {
                  <div class="radar-wrap"><co-radar-chart [axes]="axes" [size]="260" accent="#2A6FDB" /></div>
                } @else {
                  <p class="empty">Sem avaliação registrada.</p>
                }
              </co-panel-card>
            }

            <co-panel-card title="Comparação direta" class="compare-card">
              <div class="compare-row">
                <span class="compare-value" [class.win]="isBetterOrEqual(averageForSelected('a'), averageForSelected('b'))">{{ formatScore(averageForSelected('a')) }}</span>
                <span class="compare-label">Média geral</span>
                <span class="compare-value" [class.win]="isBetterOrEqual(averageForSelected('b'), averageForSelected('a'))">{{ formatScore(averageForSelected('b')) }}</span>
              </div>
              <div class="compare-row">
                <span class="compare-value" [class.win]="isBetterOrEqual(attendanceForSelected('a'), attendanceForSelected('b'))">{{ formatPercent(attendanceForSelected('a')) }}</span>
                <span class="compare-label">Presença</span>
                <span class="compare-value" [class.win]="isBetterOrEqual(attendanceForSelected('b'), attendanceForSelected('a'))">{{ formatPercent(attendanceForSelected('b')) }}</span>
              </div>
            </co-panel-card>
          </div>
        }
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
    .pickers {
      display: flex;
      gap: 12px;
    }
    .picker {
      height: 38px;
      padding: 0 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      flex: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .athlete-head {
      display: flex;
      justify-content: center;
      margin-bottom: 14px;
    }
    .radar-wrap {
      display: flex;
      justify-content: center;
    }
    .compare-card {
      grid-column: 1 / -1;
    }
    .compare-row {
      display: grid;
      grid-template-columns: 1fr 120px 1fr;
      align-items: center;
      gap: 10px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .compare-row:last-child {
      border-bottom: none;
    }
    .compare-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
      text-align: right;
    }
    .compare-value:last-child {
      text-align: left;
    }
    .compare-value.win {
      color: var(--nx-win);
    }
    .compare-label {
      text-align: center;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelCompararAtletasComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly trainingsService = inject(TrainingsService);

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  private readonly evaluationsByAthlete = computed(() =>
    latestTwoByAthlete(this.evaluationsService.evaluations()),
  );

  protected readonly athleteAUid = signal<string | null>(null);
  protected readonly athleteBUid = signal<string | null>(null);

  protected readonly athleteA = computed<RosterAthlete | null>(() => {
    const uid = this.athleteAUid() ?? this.roster()[0]?.athleteUid ?? null;
    return this.roster().find((a) => a.athleteUid === uid) ?? null;
  });

  protected readonly athleteB = computed<RosterAthlete | null>(() => {
    const uid = this.athleteBUid() ?? this.roster()[1]?.athleteUid ?? null;
    return this.roster().find((a) => a.athleteUid === uid) ?? null;
  });

  constructor() {
    effect(() => {
      const roster = this.roster();
      if (this.athleteAUid() && !roster.some((a) => a.athleteUid === this.athleteAUid())) {
        this.athleteAUid.set(null);
      }
      if (this.athleteBUid() && !roster.some((a) => a.athleteUid === this.athleteBUid())) {
        this.athleteBUid.set(null);
      }
    });
  }

  protected selectAthleteA(uid: string): void {
    this.athleteAUid.set(uid || null);
  }

  protected selectAthleteB(uid: string): void {
    this.athleteBUid.set(uid || null);
  }

  protected axesFor(athleteUid: string) {
    const entry = this.evaluationsByAthlete().get(athleteUid);
    if (!entry) {
      return null;
    }
    return FUNDAMENTALS.map((f) => ({ label: f.label, value: entry.latest.scores[f.key] }));
  }

  private averageFor(athleteUid: string): number | null {
    const entry = this.evaluationsByAthlete().get(athleteUid);
    return entry ? averageScore(entry.latest.scores) : null;
  }

  private attendanceFor(athleteUid: string): number | null {
    return attendanceRate(athleteUid, this.trainingsService.trainings());
  }

  protected averageForSelected(side: 'a' | 'b'): number | null {
    const athlete = side === 'a' ? this.athleteA() : this.athleteB();
    return athlete ? this.averageFor(athlete.athleteUid) : null;
  }

  protected attendanceForSelected(side: 'a' | 'b'): number | null {
    const athlete = side === 'a' ? this.athleteA() : this.athleteB();
    return athlete ? this.attendanceFor(athlete.athleteUid) : null;
  }

  protected isBetterOrEqual(a: number | null, b: number | null): boolean {
    if (a === null) {
      return false;
    }
    if (b === null) {
      return true;
    }
    return a >= b;
  }

  protected formatScore(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }

  protected formatPercent(value: number | null): string {
    return value === null ? '—' : `${value}%`;
  }
}
