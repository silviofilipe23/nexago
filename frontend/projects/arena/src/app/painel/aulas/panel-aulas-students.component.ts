import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaStatComponent, AulasPageComponent } from './aulas-ui';
import {
  PAY_STATE_LABEL,
  PAY_STATE_TONE,
  billingTotals,
  brl,
  enrollmentClassNames,
  slotsLabel,
  studentPayState,
  type Charge,
  type Enrollment,
  type MakeupCredit,
  type StudentPayState,
} from './billing.model';
import { fetchAvailableCredits, fetchEnrollments, fetchOpenCharges } from './billing-repository';
import { addDaysKey, shortDate, teacherInitials, todayKeyLocal } from './class.model';

export type StudentFilter = 'todos' | 'atraso' | 'vencendo' | 'creditos' | 'pausados' | 'encerrados';

export interface StudentRow {
  enrollment: Enrollment;
  state: StudentPayState;
  nextCharge: Charge | null;
  credits: number;
}

/** Linhas da tabela de alunos: uma por matrícula, com a situação pelas cobranças abertas. */
export function buildStudentRows(
  enrollments: readonly Enrollment[],
  openCharges: readonly Charge[],
  credits: readonly MakeupCredit[],
  todayKey: string,
): StudentRow[] {
  const chargesByEnrollment = new Map<string, Charge[]>();
  for (const c of openCharges) chargesByEnrollment.set(c.enrollmentId, [...(chargesByEnrollment.get(c.enrollmentId) ?? []), c]);
  const creditsByStudent = new Map<string, number>();
  for (const c of credits) creditsByStudent.set(c.studentId, (creditsByStudent.get(c.studentId) ?? 0) + 1);
  return enrollments.map((e) => {
    const charges = (chargesByEnrollment.get(e.id) ?? []).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
      enrollment: e,
      state: studentPayState(e, charges, todayKey),
      nextCharge: charges[0] ?? null,
      credits: creditsByStudent.get(e.studentId) ?? 0,
    };
  });
}

export function filterStudentRows(rows: readonly StudentRow[], filter: StudentFilter, term: string, todayKey: string): StudentRow[] {
  const in7 = addDaysKey(todayKey, 7);
  const needle = term.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return rows.filter((r) => {
    const status = r.enrollment.status;
    const live = status === 'active' || status === 'paused';
    const ok =
      filter === 'todos' ? live :
      filter === 'atraso' ? live && r.state === 'late' :
      filter === 'vencendo' ? live && r.nextCharge != null && r.nextCharge.dueDate >= todayKey && r.nextCharge.dueDate <= in7 :
      filter === 'creditos' ? live && r.credits > 0 :
      filter === 'pausados' ? status === 'paused' :
      !live;
    if (!ok) return false;
    if (!needle) return true;
    const hay = `${r.enrollment.name} ${r.enrollment.phone ?? ''}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return hay.includes(needle);
  });
}

const FILTERS: ReadonlyArray<{ id: StudentFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'atraso', label: 'Em atraso' },
  { id: 'vencendo', label: 'Vencendo' },
  { id: 'creditos', label: 'Com créditos' },
  { id: 'pausados', label: 'Pausados' },
  { id: 'encerrados', label: 'Encerrados' },
];

/** 07 · Alunos — matrículas com plano, horários, créditos e situação da mensalidade. */
@Component({
  selector: 'ar-panel-aulas-students',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, PillComponent, IconComponent, AulaStatComponent],
  template: `
    <ar-aulas-page title="Aulas" subtitle="Alunos matriculados, planos, créditos e mensalidades" tab="alunos" [empty]="!loading() && enrollments().length === 0">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="go(['/painel/aulas/matricula'])">
        <ar-icon name="plus" [size]="14" />
        Nova matrícula
      </button>

      @if (loading()) {
        <p class="state-text">Carregando alunos…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="stats">
          <ar-aula-stat label="Alunos ativos" [value]="'' + activeStudents()" [sub]="mixLabel()" />
          <ar-aula-stat label="Novos no mês" [value]="'' + newThisMonth()" tone="green" sub="matrículas" />
          <ar-aula-stat label="Cancelamentos" [value]="'' + canceledThisMonth()" sub="no mês" />
          <ar-aula-stat label="A receber · 7 dias" [value]="brl(totals().next7Reais)" [sub]="totals().next7Count + ' mensalidade(s)'" />
          <ar-aula-stat label="Em atraso" [value]="brl(totals().overdueReais)" [tone]="totals().overdueReais > 0 ? 'red' : 'default'" [sub]="totals().overdueStudents + ' aluno(s)'" />
        </div>

        <div class="filters">
          <div class="ar-filter-bar">
            @for (f of filters; track f.id) {
              <button type="button" class="ar-chip" [class.active]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
            }
          </div>
          <span class="grow"></span>
          <input class="search" type="search" placeholder="Buscar aluno" [value]="term()" (input)="term.set($any($event.target).value)" />
        </div>

        <ar-panel-card>
          <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Alunos">
            <div class="ar-table-inner">
              <div class="table-head">
                <span>Aluno</span><span>Plano</span><span>Turma</span><span>Horários</span><span>Créd.</span><span>Vencim.</span><span>Situação</span><span></span>
              </div>
              @for (r of visible(); track r.enrollment.id) {
                <button type="button" class="table-row" (click)="go(['/painel/aulas/alunos', r.enrollment.id])">
                  <span class="who">
                    <span class="av">{{ initials(r.enrollment.name) }}</span>
                    <span>
                      <span class="name">{{ r.enrollment.name }}</span>
                      <span class="sub">{{ r.enrollment.athleteId ? 'Conta NexaGO' : (r.enrollment.phone || 'Sem conta') }}</span>
                    </span>
                  </span>
                  <span class="cell">{{ r.enrollment.plan.name }}</span>
                  <span class="cell ellipsis">{{ classNames(r.enrollment) }}</span>
                  <span class="mono">{{ slots(r.enrollment) }}</span>
                  <span class="mono" [class.green]="r.credits > 0">{{ r.credits }}</span>
                  <span class="mono" [class.red]="r.state === 'late'">{{ dueLabel(r) }}</span>
                  <span><ar-pill [tone]="stateTone(r)">{{ stateLabel(r) }}</ar-pill></span>
                  <span class="chev"><ar-icon name="chevron-right" [size]="14" /></span>
                </button>
              } @empty {
                <p class="state-text empty">
                  {{ filter() === 'todos' && !term() ? 'Nenhum aluno matriculado ainda. Faça a primeira matrícula.' : 'Nenhum aluno neste filtro.' }}
                </p>
              }
            </div>
          </div>
        </ar-panel-card>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; flex: none; }
    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none; }
    .grow { flex: 1; }
    .search {
      height: 34px; width: 220px; border-radius: var(--nx-r-pill); padding: 0 14px; box-sizing: border-box;
      background: var(--nx-surface-0); border: 1px solid var(--nx-line); color: var(--nx-text); font-size: 13px;
    }
    .search:focus { outline: none; border-color: var(--nx-orange-500); }
    .table-head, .table-row {
      display: grid; grid-template-columns: minmax(200px, 1.5fr) minmax(130px, 1.1fr) minmax(130px, 1.1fr) 120px 50px 90px 110px 24px;
      gap: 12px; align-items: center;
    }
    .table-head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .table-row {
      width: 100%; padding: 10px 0; background: none; border: none; border-bottom: 1px solid var(--nx-line);
      text-align: left; cursor: pointer; color: inherit;
    }
    .table-row:hover .name { color: var(--nx-orange-500); }
    .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .who > span:last-child { display: flex; flex-direction: column; min-width: 0; }
    .av {
      width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none;
      background: var(--nx-surface-2); font-family: var(--nx-font-display); font-weight: 700; font-size: 11px; color: var(--nx-text-mute);
    }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .sub { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); margin-top: 2px; }
    .cell { font-size: 12.5px; color: var(--nx-text-mute); }
    .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; color: var(--nx-text-mute); }
    .mono.green { color: var(--nx-win); }
    .mono.red { color: var(--nx-live); }
    .chev { color: var(--nx-text-dim); display: flex; }
    @media (max-width: 1280px) { .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 720px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .search { width: 100%; } }
  `,
})
export class PanelAulasStudentsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly filters = FILTERS;
  protected readonly brl = brl;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));
  private readonly todayKey = todayKeyLocal();

  protected readonly enrollments = signal<Enrollment[]>([]);
  private readonly openCharges = signal<Charge[]>([]);
  private readonly credits = signal<MakeupCredit[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly filter = signal<StudentFilter>((this.route.snapshot.queryParamMap.get('filtro') as StudentFilter) || 'todos');
  protected readonly term = signal('');

  private readonly rows = computed(() => buildStudentRows(this.enrollments(), this.openCharges(), this.credits(), this.todayKey));
  protected readonly visible = computed(() => filterStudentRows(this.rows(), this.filter(), this.term(), this.todayKey));
  protected readonly totals = computed(() => billingTotals(this.openCharges(), this.todayKey));
  private readonly active = computed(() => this.enrollments().filter((e) => e.status === 'active'));
  protected readonly activeStudents = computed(() => new Set(this.active().map((e) => e.studentId)).size);
  protected readonly mixLabel = computed(() => {
    const monthly = this.active().filter((e) => e.plan.kind === 'monthly').length;
    const pkg = this.active().filter((e) => e.plan.kind === 'package').length;
    return `${monthly} mensalista(s) · ${pkg} pacote(s)`;
  });
  private readonly monthPrefix = this.todayKey.slice(0, 7);
  protected readonly newThisMonth = computed(() =>
    this.enrollments().filter((e) => e.startDate.startsWith(this.monthPrefix)).length,
  );
  protected readonly canceledThisMonth = computed(() =>
    this.enrollments().filter((e) => e.status === 'canceled' && e.canceledAt != null && todayKeyLocal(e.canceledAt).startsWith(this.monthPrefix)).length,
  );

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
      const db = arenaFirestore();
      const [enrollments, charges, credits] = await Promise.all([
        fetchEnrollments(db, arenaId),
        fetchOpenCharges(db, arenaId),
        fetchAvailableCredits(db, arenaId),
      ]);
      this.enrollments.set(enrollments);
      this.openCharges.set(charges);
      this.credits.set(credits);
    } catch {
      this.loadError.set('Não foi possível carregar os alunos.');
    } finally {
      this.loading.set(false);
    }
  }

  protected initials(name: string): string {
    return teacherInitials(name);
  }

  protected classNames(e: Enrollment): string {
    return enrollmentClassNames(e.slots);
  }

  protected slots(e: Enrollment): string {
    return slotsLabel(e.slots);
  }

  protected dueLabel(r: StudentRow): string {
    if (r.enrollment.plan.kind === 'package') return `${r.enrollment.creditsLeft ?? 0} aulas`;
    if (!r.nextCharge) return '—';
    return r.nextCharge.dueDate === this.todayKey ? 'Hoje' : shortDate(r.nextCharge.dueDate);
  }

  protected stateLabel(r: StudentRow): string {
    const s = r.enrollment.status;
    if (s === 'canceled') return 'Cancelado';
    if (s === 'ended') return 'Encerrado';
    return PAY_STATE_LABEL[r.state];
  }

  protected stateTone(r: StudentRow): 'green' | 'yellow' | 'red' | 'dim' {
    const s = r.enrollment.status;
    return s === 'canceled' || s === 'ended' ? 'dim' : PAY_STATE_TONE[r.state];
  }

  protected go(route: unknown[]): void {
    void this.router.navigate(route);
  }
}
