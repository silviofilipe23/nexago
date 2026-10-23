import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { CatalogActions } from '../../data/actions/catalog.actions';
import { holdsSeat } from '../../domain/enrollment';
import { CENTER_SPORTS, DEFAULT_LEVELS, PROGRAM_COLORS, sportKey, type Program } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { programRemoval } from './program-removal';
import { ModalComponent, PageHeaderComponent } from '../../ui/kit';

interface LevelDraft {
  /** Nome original (null = nível novo) — define se está em uso por turma. */
  original: string | null;
  name: string;
}

/** W12 — modalidades e níveis (ordem de progressão). Quadras ficam em cada local próprio (Locais). */
@Component({
  selector: 'ct-programs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, ModalComponent, IconComponent, RouterLink],
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
    .colors { display: flex; gap: 8px; flex-wrap: wrap; }
    .color { width: 30px; height: 30px; border-radius: 9px; border: 2px solid transparent; cursor: pointer; }
    .color.on { border-color: var(--nx-text); }
    .foot-row { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; justify-content: flex-end; }
    .remove-box { padding: 12px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); display: flex; flex-direction: column; gap: 8px; }
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

  /** Resumo das quadras por local próprio (a gestão mudou para Locais). */
  protected readonly courtsSummary = computed(() => {
    const own = this.store.locations().filter((l) => l.status === 'active' && l.type === 'own');
    const n = this.store.courts().filter((c) => own.some((l) => l.id === c.locationId)).length;
    if (own.length === 0) return 'Nenhum local próprio ativo.';
    return `${n} ${n === 1 ? 'quadra' : 'quadras'} em ${own.length} ${own.length === 1 ? 'local próprio' : 'locais próprios'}.`;
  });

  // ── Modal de modalidade ──
  protected readonly editingProgram = signal<Program | 'new' | null>(null);
  protected readonly pName = signal('');
  protected readonly pColor = signal(PROGRAM_COLORS[0]!);
  protected readonly pLevels = signal<LevelDraft[]>([]);
  protected readonly newLevel = signal('');

  /**
   * Sugestões para "Nova modalidade": o catálogo do wizard do atleta, com os esportes que o
   * centro marcou no cadastro primeiro, sem os que já viraram modalidade.
   */
  protected readonly suggestions = computed(() => {
    const taken = new Set(this.store.programs().map((p) => sportKey(p.name)));
    const mine = new Set((this.ctx.center()?.sports ?? []).map(sportKey));
    return CENTER_SPORTS.filter((s) => !taken.has(sportKey(s))).sort((a, b) => Number(mine.has(sportKey(b))) - Number(mine.has(sportKey(a))));
  });

  protected isPicked(name: string): boolean {
    return sportKey(this.pName()) === sportKey(name);
  }

  protected pickSuggestion(name: string): void {
    this.pName.set(name);
    this.error.set('');
    if (this.pLevels().length === 0) {
      this.pLevels.set(DEFAULT_LEVELS.map((l) => ({ original: null, name: l })));
    }
  }

  /** Passo de confirmação da remoção, dentro do próprio modal. */
  protected readonly confirmingDelete = signal(false);

  protected readonly removal = computed(() => {
    const p = this.editingProgram();
    if (!p || p === 'new') return null;
    return programRemoval(p.id, this.store.classes(), this.store.plans());
  });

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
    this.confirmingDelete.set(false);
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
    const dupName = this.store.programs().some((p) => sportKey(p.name) === sportKey(name) && (target === 'new' || p.id !== target.id));
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

  protected async deleteProgram(): Promise<void> {
    const target = this.editingProgram();
    const impact = this.removal();
    if (!target || target === 'new' || !impact || impact.blocked || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.deleteProgram(target, this.ctx.has('edit_plans') ? impact.sharedPlanIds : []);
      this.editingProgram.set(null);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
