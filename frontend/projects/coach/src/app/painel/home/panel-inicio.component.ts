import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AthletesService } from '../atletas/athletes.service';
import { EvaluationsService } from '../avaliacoes/evaluations.service';
import { CallUpsService } from '../convocacoes/call-ups.service';
import { TrainingsService } from '../treinos/trainings.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';

@Component({
  selector: 'co-panel-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    KpiCardComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header [title]="greeting()" [subtitle]="subtitle()" />

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Nº de atletas" [value]="rosterCountLabel()" [icon]="'team'" />
          <co-kpi-card label="Frequência" [value]="attendanceRateLabel()" [icon]="'check'" />
          <co-kpi-card label="Avaliações no mês" [value]="evaluationsThisMonthLabel()" [icon]="'radar'" />
          <co-kpi-card label="Convocações pendentes" [value]="pendingResponsesLabel()" [icon]="'bell'" />
        </div>

        <div class="grid">
          <co-panel-card title="Próximos treinos" kicker="Data mais próxima primeiro">
            @for (t of upcomingTrainings(); track t.id; let last = $last) {
              <co-row [title]="t.title" [sub]="t.date + ' · ' + t.startTime + ' · ' + (t.location || 'Local não definido')" [last]="last" />
            } @empty {
              <p class="empty">Nenhum treino agendado. <a routerLink="/painel/treinos/novo">Criar treino</a></p>
            }
          </co-panel-card>

          <div class="side">
            <co-panel-card title="Atletas lesionados" [kicker]="injuredCountLabel()">
              @for (a of injured(); track a.athleteUid; let last = $last) {
                <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
                  <co-athlete-avatar row-avatar [initials]="a.initials" [size]="32" [status]="a.status" />
                </co-row>
              } @empty {
                <p class="empty">Nenhum atleta lesionado.</p>
              }
            </co-panel-card>
            <co-panel-card title="Afastados / férias" [kicker]="awayCountLabel()">
              @for (a of awayOrVacation(); track a.athleteUid; let last = $last) {
                <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
                  <co-athlete-avatar row-avatar [initials]="a.initials" [size]="32" [status]="a.status" />
                </co-row>
              } @empty {
                <p class="empty">Ninguém afastado agora.</p>
              }
            </co-panel-card>
          </div>
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
      flex-wrap: wrap;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 16px;
      align-items: start;
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .empty a {
      color: var(--nx-orange-500);
    }
  `,
})
export class PanelInicioComponent {
  private readonly auth = inject(AuthService);
  private readonly athletesService = inject(AthletesService);
  private readonly trainingsService = inject(TrainingsService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly callUpsService = inject(CallUpsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly greeting = computed(() => {
    const name = this.auth.displayName();
    const firstName = name ? name.split(' ')[0] : null;
    return firstName ? `Bom dia, ${firstName}.` : 'Bom dia.';
  });

  protected readonly subtitle = computed(() => this.squadContext.activeSquad()?.name ?? 'Nenhuma equipe selecionada');

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly rosterCountLabel = computed(() => `${this.roster().length}`);

  protected readonly injured = computed(() => this.roster().filter((a) => a.status === 'lesionado'));
  protected readonly injuredCountLabel = computed(() => `${this.injured().length}`);

  protected readonly awayOrVacation = computed(() =>
    this.roster().filter((a) => a.status === 'afastado' || a.status === 'ferias'),
  );
  protected readonly awayCountLabel = computed(() => `${this.awayOrVacation().length}`);

  protected readonly upcomingTrainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const today = new Date().toISOString().slice(0, 10);
    return this.trainingsService
      .trainings()
      .filter((t) => (!activeId || t.squadId === activeId) && t.date >= today && t.status !== 'cancelado')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  });

  protected readonly attendanceRateLabel = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const trainings = this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
    let total = 0;
    let present = 0;
    for (const t of trainings) {
      for (const status of Object.values(t.attendance)) {
        total++;
        if (status === 'presente') {
          present++;
        }
      }
    }
    return total === 0 ? '—' : `${Math.round((present / total) * 100)}%`;
  });

  protected readonly evaluationsThisMonthLabel = computed(() => {
    const prefix = new Date().toISOString().slice(0, 7);
    const n = this.evaluationsService.evaluations().filter((e) => e.date.startsWith(prefix)).length;
    return `${n}`;
  });

  protected readonly pendingResponsesLabel = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const n = this.callUpsService
      .callUps()
      .filter((c) => !activeId || c.squadId === activeId)
      .reduce((sum, c) => sum + Object.values(c.responses).filter((r) => r === 'aguardando').length, 0);
    return `${n}`;
  });
}
