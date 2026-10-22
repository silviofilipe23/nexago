import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { todayKey } from '../../domain/dates';
import { STUDENT_STATUS } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, PersonComponent } from '../../ui/kit';
import { downloadCsv, toCsv } from '../../ui/csv';
import { AddStudentModalComponent } from './add-student-modal.component';
import { buildStudentRows, FINANCE_LABEL, matchesFilter, matchesSearch, type StudentFilter } from './student-rows';

const CHIPS: { value: StudentFilter; label: string; dot?: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'invited', label: 'Convidados' },
  { value: 'pending', label: 'Com pendência', dot: '#FF3B30' },
  { value: 'minors', label: 'Menores', dot: '#5B9BFF' },
  { value: 'credits', label: 'Com créditos', dot: '#2BD17E' },
];

/** W9 — lista de alunos do centro. */
@Component({
  selector: 'ct-students',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, PersonComponent, IconComponent, AddStudentModalComponent],
  templateUrl: './students.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .search { width: 300px; max-width: 100%; }
    .freq-low { color: var(--nx-pending); }
    .cred { color: var(--nx-win); }
    .num { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 600; color: var(--nx-text); }
    .num.none { color: var(--nx-text-dim); }
    .cls { color: var(--nx-text); }
  `,
})
export class StudentsComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly router = inject(Router);

  readonly centerId = input.required<string>();
  /** `?novo=1` abre o modal de cadastro direto (atalho do dashboard). */
  readonly novo = input<string>();

  protected readonly chips = CHIPS;
  protected readonly statusLabel = STUDENT_STATUS;
  protected readonly financeLabel = FINANCE_LABEL;
  protected readonly term = signal('');
  protected readonly filter = signal<StudentFilter>('all');
  protected readonly adding = signal(false);

  protected readonly canAdd = computed(() => this.ctx.has('enroll_students') && this.ctx.canWrite());
  protected readonly seesFinance = computed(() => this.ctx.has('view_finance'));
  protected readonly visibleChips = computed(() => CHIPS.filter((c) => c.value !== 'pending' || this.seesFinance()));
  private readonly today = computed(() => todayKey(this.ctx.center()?.timezone));

  protected readonly rows = computed(() =>
    buildStudentRows(
      this.store.students(),
      this.store.enrollments(),
      this.store.sessions(),
      this.seesFinance() ? this.store.invoices() : null,
      this.today(),
    ),
  );
  protected readonly filtered = computed(() => {
    const t = this.term();
    const f = this.filter();
    return this.rows().filter((r) => matchesFilter(r, f) && matchesSearch(r.student, t));
  });
  protected readonly subtitle = computed(() => {
    const s = this.store.students();
    const n = (st: string) => s.filter((x) => x.status === st).length;
    return s.length === 0 ? 'Nenhum aluno cadastrado' : `${n('active')} ativos · ${n('invited')} convidados · ${n('inactive')} inativos · ${n('blocked')} bloqueados`;
  });

  constructor() {
    effect(() => {
      if (this.novo() === '1' && this.canAdd()) {
        untracked(() => this.adding.set(true));
      }
    });
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected closeAdd(): void {
    this.adding.set(false);
    if (this.novo()) {
      void this.router.navigate([], { queryParams: { novo: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  protected added(id: string): void {
    this.adding.set(false);
    void this.router.navigate(['/centro', this.centerId(), 'alunos', id]);
  }

  /** CSV das linhas filtradas (o que está na tela). */
  protected exportCsv(): void {
    const fin = this.seesFinance();
    const head = ['Nome', 'E-mail', 'Telefone', 'Situação', 'Menor', 'Responsável', 'Turma', 'Plano', 'Frequência %', 'Créditos'];
    const rows = this.filtered().map((r) => {
      const s = r.student;
      const base = [
        s.name,
        s.email,
        s.phone,
        STUDENT_STATUS[s.status][0],
        s.isMinor ? 'Sim' : 'Não',
        s.guardian?.name ?? '',
        r.className === '—' ? '' : r.className,
        r.planName === '—' ? '' : r.planName,
        r.freq,
        s.makeupCredits,
      ];
      return fin ? [...base, r.finance ? FINANCE_LABEL[r.finance.state][0] : ''] : base;
    });
    downloadCsv(`alunos-${this.today()}.csv`, toCsv([fin ? [...head, 'Financeiro'] : head, ...rows]));
  }
}
