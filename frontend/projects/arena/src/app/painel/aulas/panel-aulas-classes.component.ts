import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import { AulaTypeTagComponent, AulasPageComponent, OccupancyBarComponent, TeacherAvatarComponent } from './aulas-ui';
import {
  CLASS_LEVEL_LABEL,
  WEEKDAY_SHORT,
  isRecurringClass,
  sportLabel,
  todayKeyLocal,
  type ArenaClass,
} from './class.model';
import { fetchClasses } from './classes-repository';

/** 04 · Turmas — turmas recorrentes (inclui particular fixa). Aula avulsa de um dia só
 *  aparece na agenda, não aqui. */
@Component({
  selector: 'ar-panel-aulas-classes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, IconComponent, PillComponent, AulaTypeTagComponent, TeacherAvatarComponent, OccupancyBarComponent],
  template: `
    <ar-aulas-page title="Aulas" subtitle="Turmas com professor, horário e quadra fixos" tab="turmas" [empty]="!loading() && recurring().length === 0">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="create()">
        <ar-icon name="plus" [size]="14" />
        Criar turma
      </button>

      @if (loading()) {
        <p class="state-text">Carregando turmas…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="filters">
          <div class="ar-filter-bar">
            <button type="button" class="ar-chip" [class.active]="sport() === null" (click)="sport.set(null)">Todas · {{ inTab().length }}</button>
            @for (s of sports(); track s.code) {
              <button type="button" class="ar-chip" [class.active]="sport() === s.code" (click)="sport.set(s.code)">{{ s.label }} · {{ s.count }}</button>
            }
          </div>
          <span class="grow"></span>
          <div class="ar-chart-tabs">
            <button type="button" [class.active]="tab() === 'ativas'" (click)="tab.set('ativas')">Ativas</button>
            <button type="button" [class.active]="tab() === 'encerradas'" (click)="tab.set('encerradas')">Encerradas</button>
          </div>
        </div>

        <div class="grid">
          @for (c of visible(); track c.id) {
            <article class="card" [class.paused]="c.status === 'paused'">
              <div class="top">
                <div class="titles">
                  <div class="name-row">
                    <span class="name">{{ c.name }}</span>
                    @if (c.type !== 'turma') {
                      <ar-aula-type-tag [type]="c.type" />
                    }
                  </div>
                  <div class="sub">{{ sportLabel(c.sport) }} · {{ levelLabel[c.level] }}</div>
                </div>
                @if (c.status === 'paused') {
                  <ar-pill tone="yellow">Pausada</ar-pill>
                } @else if (c.status === 'archived') {
                  <ar-pill tone="dim">Encerrada</ar-pill>
                } @else if (c.studentCount >= c.capacity) {
                  <ar-pill tone="green">Lotada</ar-pill>
                } @else {
                  <ar-pill tone="dim">{{ c.capacity - c.studentCount }} vaga{{ c.capacity - c.studentCount === 1 ? '' : 's' }}</ar-pill>
                }
              </div>

              <div class="days-row">
                <div class="days">
                  @for (d of weekdays; track d) {
                    <span class="day" [class.on]="c.weekdays.includes(d)">{{ weekdayShort[d]![0] }}</span>
                  }
                </div>
                <span class="mono">{{ c.startTime }}–{{ c.endTime }}</span>
              </div>

              <div class="teacher">
                <ar-teacher-avatar [name]="c.teacherName" [color]="c.teacherColor" [size]="26" />
                <span class="teacher-name">{{ c.teacherName }}</span>
                <span class="mono dim">{{ c.courtName }}</span>
              </div>

              <div>
                <div class="students-head">
                  <span class="mono dim">Alunos</span>
                  <span class="mono">{{ c.studentCount }}/{{ c.capacity }}</span>
                </div>
                <ar-occupancy-bar [pct]="c.capacity > 0 ? (c.studentCount / c.capacity) * 100 : 0" />
              </div>

              @if (futureConflicts(c) > 0) {
                <div class="conflict">
                  {{ futureConflicts(c) }} aula{{ futureConflicts(c) === 1 ? '' : 's' }} sem quadra — horário já ocupado
                </div>
              }

              <div class="foot">
                <span class="mono dim">{{ c.endDate ? 'Até ' + shortDate(c.endDate) : 'Sem data fim' }}</span>
                <button type="button" class="ar-ghost-btn" (click)="open(c.id)">
                  Abrir
                  <ar-icon name="chevron-right" [size]="13" />
                </button>
              </div>
            </article>
          } @empty {
            <p class="state-text">
              @if (tab() === 'ativas') {
                Nenhuma turma ainda. Crie a primeira: a quadra fica bloqueada para aluguel nos horários dela.
              } @else {
                Nenhuma turma encerrada.
              }
            </p>
          }
        </div>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; line-height: 1.5; }
    .filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex: none; }
    .grow { flex: 1; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 16px;
      align-content: start;
    }
    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 13px;
    }
    .card.paused { opacity: 0.75; }
    .top { display: flex; align-items: flex-start; gap: 10px; }
    .titles { flex: 1; min-width: 0; }
    .name-row { display: flex; align-items: center; gap: 8px; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; color: var(--nx-text); }
    .sub { font-size: 12.5px; color: var(--nx-text-dim); margin-top: 3px; }
    .days-row { display: flex; align-items: center; justify-content: space-between; }
    .days { display: flex; gap: 3px; }
    .day {
      width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono); font-size: 8.5px; font-weight: 700; color: var(--nx-text-dim);
    }
    .day.on { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.3); color: var(--nx-orange-500); }
    .mono { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; color: var(--nx-text); }
    .mono.dim { font-weight: 500; color: var(--nx-text-dim); }
    .teacher {
      display: flex; align-items: center; gap: 9px; padding: 9px 10px;
      border-radius: var(--nx-r-2); background: var(--nx-surface-1);
    }
    .teacher-name { flex: 1; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .students-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .conflict {
      padding: 8px 10px; border-radius: var(--nx-r-2); font-size: 12px;
      background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.28); color: var(--nx-live);
    }
    .foot { display: flex; align-items: center; justify-content: space-between; padding-top: 11px; border-top: 1px solid var(--nx-line); }
  `,
})
export class PanelAulasClassesComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);

  protected readonly weekdays = [1, 2, 3, 4, 5, 6, 7];
  protected readonly weekdayShort = WEEKDAY_SHORT;
  protected readonly levelLabel = CLASS_LEVEL_LABEL;
  protected readonly sportLabel = sportLabel;

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));
  protected readonly classes = signal<ArenaClass[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly tab = signal<'ativas' | 'encerradas'>('ativas');
  protected readonly sport = signal<string | null>(null);

  protected readonly recurring = computed(() => this.classes().filter(isRecurringClass));
  protected readonly inTab = computed(() =>
    this.recurring().filter((c) => (this.tab() === 'ativas' ? c.status !== 'archived' : c.status === 'archived')),
  );
  protected readonly sports = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.inTab()) counts.set(c.sport, (counts.get(c.sport) ?? 0) + 1);
    return [...counts.entries()].map(([code, count]) => ({ code, count, label: sportLabel(code) }));
  });
  protected readonly visible = computed(() => {
    const sport = this.sport();
    return this.inTab().filter((c) => sport == null || c.sport === sport);
  });

  private readonly todayKey = todayKeyLocal();

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.classes.set(await fetchClasses(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar as turmas.');
    } finally {
      this.loading.set(false);
    }
  }

  protected futureConflicts(c: ArenaClass): number {
    return c.conflictDates.filter((d) => d >= this.todayKey).length;
  }

  protected shortDate(dateKey: string): string {
    const [y, m, d] = dateKey.split('-');
    return `${d}/${m}/${y}`;
  }

  protected create(): void {
    if (!this.readOnly()) void this.router.navigate(['/painel/aulas/turmas/nova']);
  }

  protected open(id: string): void {
    void this.router.navigate(['/painel/aulas/turmas', id]);
  }
}
