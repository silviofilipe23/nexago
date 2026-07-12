import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { TrainingsService } from '../treinos/trainings.service';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface WeekDay {
  iso: string;
  label: string;
  dayNumber: number;
}

@Component({
  selector: 'co-panel-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Agenda" [subtitle]="weekLabel()">
        <div class="actions">
          <button type="button" class="co-ghost-btn" (click)="previousWeek()">← Anterior</button>
          <button type="button" class="co-ghost-btn" (click)="nextWeek()">Próxima →</button>
          <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/treinos/novo">
            <co-icon name="plus" [size]="14" />
            Novo treino
          </a>
        </div>
      </co-page-header>

      <div class="body">
        <co-panel-card pad="sm" class="grid-card">
          <div class="week-grid">
            @for (day of weekDays(); track day.iso; let last = $last) {
              <div class="day-col" [class.last]="last">
                <div class="day-label">{{ day.label }} {{ day.dayNumber }}</div>
                @for (t of trainingsForDay(day.iso); track t.id) {
                  <div class="event">{{ t.startTime }} · {{ t.title }}</div>
                } @empty {
                  <div class="event-empty">—</div>
                }
              </div>
            }
          </div>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: hidden;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .grid-card {
      height: 100%;
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      height: 100%;
    }
    .day-col {
      padding: 14px;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .day-col.last {
      border-right: none;
    }
    .day-label {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }
    .event {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      font-weight: 600;
      padding: 4px 7px;
      border-radius: 6px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-400);
      margin-bottom: 4px;
    }
    .event-empty {
      color: var(--nx-text-dim);
      font-size: 11px;
    }
  `,
})
export class PanelAgendaComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly weekOffset = signal(0);

  protected readonly weekDays = computed<WeekDay[]>(() => {
    const base = addDays(startOfWeek(new Date()), this.weekOffset() * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return { iso: toIsoDate(d), label: WEEKDAY_LABELS[i], dayNumber: d.getDate() };
    });
  });

  protected readonly weekLabel = computed(() => {
    const days = this.weekDays();
    return `Semana de ${days[0]!.dayNumber} a ${days[6]!.dayNumber}`;
  });

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected trainingsForDay(iso: string) {
    return this.trainings().filter((t) => t.date === iso);
  }

  protected previousWeek(): void {
    this.weekOffset.update((w) => w - 1);
  }

  protected nextWeek(): void {
    this.weekOffset.update((w) => w + 1);
  }
}
