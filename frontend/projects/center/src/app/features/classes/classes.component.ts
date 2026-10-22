import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { isFull, waitlistOf } from '../../domain/enrollment';
import { daysOutsideWindow, placeLabel } from '../../domain/locations';
import { CLASS_STATUS, type TrainingClass } from '../../domain/models';
import { weekdaysLabel } from '../../domain/schedule';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, PersonComponent, SegmentedComponent } from '../../ui/kit';
import { ClassFormModalComponent } from './class-form-modal.component';
import { CoachClassEditComponent } from './coach-class-edit.component';

type StatusTab = 'active' | 'draft' | 'closed';

/**
 * W13 — turmas. Owner/admin editam tudo; o professor com `edit_classes` ajusta nome, nível e
 * quadra só das turmas dele (o resto mexe em contrato, agenda e cobrança); recepção só lê.
 */
@Component({
  selector: 'ct-classes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PersonComponent, SegmentedComponent, IconComponent, ClassFormModalComponent, CoachClassEditComponent],
  templateUrl: './classes.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .card { padding: 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); text-align: left; font: inherit; color: inherit; cursor: pointer; width: 100%; }
    .card:hover { border-color: rgba(255,106,26,0.5); }
    .sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
    .prog { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-text-mute); }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; margin-top: 10px; color: var(--nx-text); }
    .rule { margin-top: 4px; text-transform: uppercase; }
    .bar { width: 90px; }
    .seats { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-text); }
    .seats.full, .wait { color: var(--nx-pending); }
    .wait { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 600; margin-top: 8px; }
    .spacer { flex: 1; }
    .place { margin-top: 6px; display: flex; align-items: center; gap: 5px; color: var(--nx-text-dim); font-size: 12px; }
    .warn { margin-top: 8px; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 600; color: var(--nx-pending); display: flex; align-items: center; gap: 5px; }
  `,
})
export class ClassesComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly router = inject(Router);

  readonly centerId = input.required<string>();
  /** `?editar=<classId>&desde=<dayKey>` — vem da agenda ("esta e as próximas"). */
  readonly editar = input<string>();
  readonly desde = input<string>();
  /** `?nova=1` — atalho do estado vazio da agenda. */
  readonly nova = input<string>();

  protected readonly statusLabel = CLASS_STATUS;
  protected readonly tabs = [
    { value: 'active', label: 'Ativas' },
    { value: 'draft', label: 'Rascunho' },
    { value: 'closed', label: 'Encerradas' },
  ];
  protected readonly tab = signal<string>('active');
  protected readonly program = signal<string | null>(null);
  protected readonly onlyMine = signal(true);

  protected readonly canEdit = computed(() => this.ctx.isManager() && this.ctx.canWrite());

  /** Professor na própria turma, ainda em andamento. */
  protected coachCanEdit(c: TrainingClass): boolean {
    return (
      !this.ctx.isManager() &&
      this.ctx.canWrite() &&
      this.ctx.has('edit_classes') &&
      c.coachUid === this.ctx.me()?.uid &&
      (c.status === 'active' || c.status === 'draft')
    );
  }
  protected readonly isCoach = computed(() => this.ctx.me()?.role === 'coach');
  protected readonly seesEnrollments = computed(() => this.ctx.has('view_enrollments') || this.ctx.has('enroll_students'));

  /** Modal aberto: null = fechado, 'new' = nova turma. */
  protected readonly modal = signal<TrainingClass | 'new' | null>(null);
  protected readonly modalFrom = signal<string | null>(null);

  private readonly scoped = computed(() => {
    const uid = this.ctx.me()?.uid;
    const p = this.program();
    return this.store
      .classes()
      .filter((c) => !p || c.programId === p)
      .filter((c) => !(this.isCoach() && this.onlyMine()) || c.coachUid === uid);
  });

  protected readonly visible = computed(() => {
    const t = this.tab() as StatusTab;
    return this.scoped()
      .filter((c) => (t === 'closed' ? c.status === 'closed' || c.status === 'cancelled' : c.status === t))
      .map((c) => {
        const waitlist = this.seesEnrollments() ? waitlistOf(this.store.enrollments(), c.id) : [];
        return {
          c,
          program: this.store.programById(c.programId),
          full: isFull(c),
          pct: c.capacity ? Math.min(100, (c.seatsTaken / c.capacity) * 100) : 0,
          rule: `${weekdaysLabel(c.weekdays)} · ${c.startTime} · ${c.durationMin}min`,
          place: placeLabel(c),
          placeWarn: this.placeWarning(c),
          waitlist: waitlist.length,
          waitNames: waitlist.slice(0, 3).map((e) => e.studentName.split(' ')[0]).join(', '),
        };
      });
  });

  protected readonly subtitle = computed(() => {
    const all = this.store.classes();
    if (all.length === 0) return 'Nenhuma turma cadastrada';
    const active = all.filter((c) => c.status === 'active');
    const taken = active.reduce((s, c) => s + Math.min(c.seatsTaken, c.capacity), 0);
    const cap = active.reduce((s, c) => s + c.capacity, 0);
    return `${active.length} ativas · ${all.filter((c) => c.status === 'draft').length} rascunho · ${taken}/${cap} vagas ocupadas`;
  });

  constructor() {
    // Abre a edição pedida pela agenda assim que a turma chegar do listener (uma vez por link).
    let handled = '';
    effect(() => {
      const id = this.editar();
      const c = id ? this.store.classById(id) : undefined;
      if (!id || !c || handled === id) return;
      handled = id;
      untracked(() => {
        this.tab.set(c.status === 'draft' ? 'draft' : c.status === 'active' ? 'active' : 'closed');
        this.modalFrom.set(this.desde() ?? null);
        this.modal.set(c);
      });
    });
    effect(() => {
      if (this.nova() === '1' && this.canEdit()) {
        untracked(() => this.modal.set('new'));
      }
    });
  }

  /** Turma ativa cujo local foi arquivado ou cuja janela do parceiro não cobre mais o horário. */
  private placeWarning(c: TrainingClass): string {
    if (c.status !== 'active' && c.status !== 'draft') return '';
    const loc = c.locationId ? this.store.locationById(c.locationId) : undefined;
    if (!loc) return '';
    if (loc.status === 'archived') return 'Local arquivado — mude o local da turma';
    return daysOutsideWindow(loc, c.weekdays, c.startTime, c.durationMin).length ? 'Fora da janela contratada do parceiro' : '';
  }

  protected open(c: TrainingClass | null): void {
    this.modalFrom.set(null);
    this.modal.set(c ?? 'new');
  }

  protected close(): void {
    this.modal.set(null);
    if (this.editar() || this.desde() || this.nova()) {
      void this.router.navigate([], { queryParams: { editar: null, desde: null, nova: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }
}
