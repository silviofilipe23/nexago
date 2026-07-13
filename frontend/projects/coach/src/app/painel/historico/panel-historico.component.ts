import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { averageScore } from '../avaliacoes/evaluation-stats';
import { EvaluationsService } from '../avaliacoes/evaluations.service';
import { AttendanceStatus, TrainingsService } from '../treinos/trainings.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';

interface HistoryItem {
  date: string;
  kind: 'presenca' | 'avaliacao';
  title: string;
  sub: string;
}

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  atrasado: 'Atrasado',
  justificado: 'Justificado',
};

@Component({
  selector: 'co-panel-historico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Histórico completo" [subtitle]="subtitle()">
        <select class="picker" [value]="athleteUid() ?? ''" (change)="selectAthlete($any($event.target).value)">
          <option value="">Selecione um atleta…</option>
          @for (a of roster(); track a.athleteUid) {
            <option [value]="a.athleteUid">{{ a.displayName }}</option>
          }
        </select>
        <a class="co-ghost-btn" routerLink="/painel/historico/relatorios">
          <co-icon name="download" [size]="14" />
          Relatórios
        </a>
      </co-page-header>

      <div class="body">
        @if (!athleteUid()) {
          <p class="empty">Selecione um atleta pra ver a linha do tempo.</p>
        } @else {
          <co-panel-card title="Tudo registrado">
            @for (item of items(); track item.date + item.title; let last = $last) {
              <div class="item" [class.last]="last">
                <div class="item-date">{{ item.date }}</div>
                <div class="item-dot" [class]="'kind-' + item.kind"></div>
                <div class="item-body">
                  <div class="item-title">{{ item.title }}</div>
                  @if (item.sub) {
                    <div class="item-sub">{{ item.sub }}</div>
                  }
                </div>
              </div>
            } @empty {
              <p class="empty">Nenhum registro ainda pra este atleta.</p>
            }
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: auto;
    }
    .picker {
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .item {
      display: flex;
      gap: 14px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .item.last {
      border-bottom: none;
    }
    .item-date {
      width: 78px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      padding-top: 2px;
    }
    .item-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 6px;
      flex: none;
    }
    .item-dot.kind-presenca {
      background: var(--nx-orange-500);
    }
    .item-dot.kind-avaliacao {
      background: var(--nx-win);
    }
    .item-body {
      flex: 1;
      min-width: 0;
    }
    .item-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .item-sub {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class PanelHistoricoComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly trainingsService = inject(TrainingsService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly athleteUid = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const a = this.roster().find((r) => r.athleteUid === this.athleteUid());
    return a ? `${a.displayName} · Linha do tempo` : 'Selecione um atleta';
  });

  protected readonly items = computed<HistoryItem[]>(() => {
    const uid = this.athleteUid();
    if (!uid) {
      return [];
    }

    const attendanceItems: HistoryItem[] = this.trainingsService
      .trainings()
      .filter((t) => t.attendance[uid] != null)
      .map((t) => ({
        date: t.date,
        kind: 'presenca' as const,
        title: `${ATTENDANCE_LABEL[t.attendance[uid]]} · ${t.title}`,
        sub: [t.startTime, t.location].filter(Boolean).join(' · '),
      }));

    const evaluationItems: HistoryItem[] = this.evaluationsService
      .evaluations()
      .filter((e) => e.athleteUid === uid)
      .map((e) => ({
        date: e.date,
        kind: 'avaliacao' as const,
        title: `Avaliação técnica registrada · média ${averageScore(e.scores).toFixed(1)}`,
        sub: e.notes,
      }));

    return [...attendanceItems, ...evaluationItems].sort((a, b) => b.date.localeCompare(a.date));
  });

  protected selectAthlete(uid: string): void {
    this.athleteUid.set(uid || null);
  }
}
