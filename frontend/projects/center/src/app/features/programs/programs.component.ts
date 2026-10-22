import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { CatalogActions } from '../../data/actions/catalog.actions';
import { formatDayKey, isValidDayKey, todayKey } from '../../domain/dates';
import { holdsSeat } from '../../domain/enrollment';
import { PROGRAM_COLORS, type Court, type Program } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { ModalComponent, PageHeaderComponent } from '../../ui/kit';
import { courtOccupancy } from './court-occupancy';

interface LevelDraft {
  /** Nome original (null = nível novo) — define se está em uso por turma. */
  original: string | null;
  name: string;
}

/** W12 — modalidades, níveis (ordem de progressão) e quadras. */
@Component({
  selector: 'ct-programs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, ModalComponent, IconComponent],
  templateUrl: './programs.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    .pname { font-family: var(--nx-font-display); font-weight: 800; font-size: 17px; color: var(--nx-text); }
    .big { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; color: var(--nx-text); }
    .level { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); margin-top: 6px; }
    .level .ct-input { height: 34px; }
    .idx { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-text-dim); }
    .courts { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .court { padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); text-align: left; font: inherit; color: inherit; width: 100%; }
    button.court { cursor: pointer; }
    button.court:hover { border-color: var(--nx-line-strong); }
    .colors { display: flex; gap: 8px; flex-wrap: wrap; }
    .color { width: 30px; height: 30px; border-radius: 9px; border: 2px solid transparent; cursor: pointer; }
    .color.on { border-color: var(--nx-text); }
    .icon-btn { width: 30px; height: 30px; padding: 0; justify-content: center; }
  `,
})
export class ProgramsComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(CatalogActions);

  readonly centerId = input.required<string>();

  protected readonly colors = PROGRAM_COLORS;
  protected readonly canEdit = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  protected readonly seesEnrollments = computed(() => this.ctx.has('view_enrollments') || this.ctx.has('enroll_students'));
  private readonly today = computed(() => todayKey(this.ctx.center()?.timezone));

  /** Turmas que ainda "existem" na grade (ativas e rascunhos). */
  private readonly liveClasses = computed(() => this.store.classes().filter((c) => c.status === 'active' || c.status === 'draft'));

  protected readonly cards = computed(() => {
    const enr = this.store.enrollments().filter((e) => holdsSeat(e.status));
    return this.store.programs().map((p) => {
      const classes = this.liveClasses().filter((c) => c.programId === p.id);
      const ids = new Set(classes.map((c) => c.id));
      const students = new Set(enr.filter((e) => ids.has(e.classId)).map((e) => e.studentId)).size;
      return {
        program: p,
        classes: classes.length,
        students,
        levels: p.levels.map((l) => ({ name: l, classes: classes.filter((c) => c.level === l).length })),
      };
    });
  });

  protected readonly subtitle = computed(() => {
    const p = this.store.programs();
    if (p.length === 0) return 'Nenhuma modalidade cadastrada';
    const levels = p.reduce((s, x) => s + x.levels.length, 0);
    return `${p.length} modalidade${p.length > 1 ? 's' : ''} · ${levels} níveis · ${this.liveClasses().length} turmas`;
  });

  protected readonly courtCards = computed(() =>
    this.store.courts().map((c) => {
      const inMaintenance = c.status === 'maintenance' && (!c.maintenanceUntil || c.maintenanceUntil >= this.today());
      return {
        court: c,
        occ: courtOccupancy(this.store.classes(), c.id),
        sub: [c.description, inMaintenance ? `manutenção${c.maintenanceUntil ? ' até ' + formatDayKey(c.maintenanceUntil) : ''}` : ''].filter(Boolean).join(' · '),
        inMaintenance,
      };
    }),
  );

  // ── Modal de modalidade ──
  protected readonly editingProgram = signal<Program | 'new' | null>(null);
  protected readonly pName = signal('');
  protected readonly pColor = signal(PROGRAM_COLORS[0]!);
  protected readonly pLevels = signal<LevelDraft[]>([]);
  protected readonly newLevel = signal('');

  // ── Modal de quadra ──
  protected readonly editingCourt = signal<Court | 'new' | null>(null);
  protected readonly cName = signal('');
  protected readonly cDesc = signal('');
  protected readonly cStatus = signal<'active' | 'maintenance'>('active');
  protected readonly cUntil = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Turmas (qualquer situação) que usam o nível — renomear ou remover deixaria a turma órfã. */
  protected levelUse(level: LevelDraft): number {
    const p = this.editingProgram();
    if (!level.original || !p || p === 'new') return 0;
    return this.store.classes().filter((c) => c.programId === p.id && c.level === level.original).length;
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected openProgram(p: Program | null): void {
    this.pName.set(p?.name ?? '');
    this.pColor.set(p?.color ?? PROGRAM_COLORS[this.store.programs().length % PROGRAM_COLORS.length]!);
    this.pLevels.set((p?.levels ?? []).map((l) => ({ original: l, name: l })));
    this.newLevel.set('');
    this.error.set('');
    this.editingProgram.set(p ?? 'new');
  }

  protected renameLevel(i: number, name: string): void {
    this.pLevels.update((list) => list.map((l, k) => (k === i ? { ...l, name } : l)));
  }

  protected moveLevel(i: number, delta: number): void {
    this.pLevels.update((list) => {
      const j = i + delta;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  protected removeLevel(i: number): void {
    this.pLevels.update((list) => list.filter((_, k) => k !== i));
  }

  protected addLevel(): void {
    const name = this.newLevel().trim();
    if (!name) return;
    this.pLevels.update((list) => [...list, { original: null, name }]);
    this.newLevel.set('');
  }

  protected async saveProgram(): Promise<void> {
    const target = this.editingProgram();
    if (!target || this.busy()) return;
    const name = this.pName().trim();
    const levels = this.pLevels().map((l) => l.name.trim()).filter(Boolean);
    const dupName = this.store.programs().some((p) => p.name.toLowerCase() === name.toLowerCase() && (target === 'new' || p.id !== target.id));
    if (name.length < 2) return this.error.set('Informe o nome da modalidade.');
    if (dupName) return this.error.set('Já existe uma modalidade com esse nome.');
    if (levels.length === 0) return this.error.set('Cadastre pelo menos um nível.');
    if (new Set(levels.map((l) => l.toLowerCase())).size !== levels.length) return this.error.set('Há níveis com o mesmo nome.');
    const order = target === 'new' ? Math.max(-1, ...this.store.programs().map((p) => p.order)) + 1 : target.order;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.saveProgram(target === 'new' ? null : target.id, { name, color: this.pColor(), levels, order });
      this.editingProgram.set(null);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected openCourt(c: Court | null): void {
    this.cName.set(c?.name ?? '');
    this.cDesc.set(c?.description ?? '');
    this.cStatus.set(c?.status ?? 'active');
    this.cUntil.set(c?.maintenanceUntil ?? '');
    this.error.set('');
    this.editingCourt.set(c ?? 'new');
  }

  protected async saveCourt(): Promise<void> {
    const target = this.editingCourt();
    if (!target || this.busy()) return;
    const name = this.cName().trim();
    const maintenance = this.cStatus() === 'maintenance';
    if (name.length < 2) return this.error.set('Informe o nome da quadra.');
    if (this.store.courts().some((c) => c.name.toLowerCase() === name.toLowerCase() && (target === 'new' || c.id !== target.id))) {
      return this.error.set('Já existe uma quadra com esse nome.');
    }
    if (maintenance && this.cUntil() && !isValidDayKey(this.cUntil())) return this.error.set('Data de fim da manutenção inválida.');
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.saveCourt(target === 'new' ? null : target.id, {
        name,
        description: this.cDesc(),
        status: this.cStatus(),
        maintenanceUntil: maintenance && this.cUntil() ? this.cUntil() : null,
      });
      this.editingCourt.set(null);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
