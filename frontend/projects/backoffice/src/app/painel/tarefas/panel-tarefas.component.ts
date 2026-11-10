import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { callableErrorMessage } from '../data/callable-error';
import { TaskBadgesService } from '../data/task-badges.service';
import { TeamRepository } from '../equipe/data/team.repository';
import { IconComponent } from '../ui/icon.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  AREAS,
  AREA_LABELS,
  STATUSES,
  STATUS_LABELS,
  byStatus,
  dateKeyOf,
  dueState,
  emptyDraft,
  matchesTask,
  myDueCount,
  orderAtEnd,
  orderFor,
  type Member,
  type Task,
  type TaskArea,
  type TaskDraft,
  type TaskStatus,
} from './data/task';
import { TasksRepository } from './data/tasks.repository';
import { TaskAvatarComponent } from './ui/task-avatar.component';
import { TaskCardComponent } from './ui/task-card.component';
import { TaskDrawerComponent } from './ui/task-drawer.component';

/** Concluído mostra as mais recentes; o resto fica atrás de "ver todas". */
const DONE_VISIBLE = 5;

interface DropTarget {
  status: TaskStatus;
  /** Card que fica logo abaixo do arrastado; `null` = fim da coluna. */
  beforeId: string | null;
}

/** Erro do Firestore em português; `permission-denied` aqui quase sempre é sessão sem a claim. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  if (code.includes('permission-denied')) return 'Sem permissão para o quadro. Saia e entre de novo no backoffice.';
  if (code.includes('unavailable')) return 'Sem conexão com o servidor. Tente de novo em instantes.';
  return callableErrorMessage(error);
}

/**
 * Equipe › Tarefas: kanban da equipe do backoffice (`backofficeTasks`), ao vivo. Arrastar entre e
 * dentro das colunas grava etapa e posição; o painel lateral cria e edita.
 */
@Component({
  selector: 'bo-panel-tarefas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, IconComponent, TaskCardComponent, TaskDrawerComponent, TaskAvatarComponent],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Equipe › Tarefas</div>
          <h1>
            Quadro da equipe
            @if (tasks()) {
              <span class="pill orange">{{ openCount() }} {{ openCount() === 1 ? 'aberta' : 'abertas' }}</span>
              @if (overdueCount() > 0) {
                <span class="pill red">{{ overdueCount() }} {{ overdueCount() === 1 ? 'atrasada' : 'atrasadas' }}</span>
              }
            }
          </h1>
        </div>
        <div class="spacer"></div>
        <label class="search">
          <bo-icon name="search" [size]="15" />
          <input type="search" placeholder="Buscar tarefa..." aria-label="Buscar tarefa" [value]="term()" (input)="term.set(text($event))" />
        </label>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary big" [disabled]="!tasks()" (click)="openNew('todo')">
          <bo-icon name="plus" [size]="14" [strokeWidth]="2.2" /> Nova tarefa
        </button>
      </header>

      <div class="body">
        <div class="filters">
          <button type="button" class="chip" [class.on]="!assignee() && !overdueOnly() && !showArchived()" (click)="clearFilters()">Todas</button>
          <button type="button" class="chip" [class.on]="assignee() === myUid() && !showArchived()" (click)="toggleAssignee(myUid())">
            Minhas <span class="n">{{ mineCount() }}</span>
          </button>
          <button type="button" class="chip" [class.on]="overdueOnly() && !showArchived()" (click)="overdueOnly.set(!overdueOnly()); showArchived.set(false)">
            <span class="dot red"></span>Atrasadas <span class="n">{{ overdueCount() }}</span>
          </button>

          @if (people().length > 0) {
            <span class="sep"></span>
            <span class="kicker">Responsável</span>
            <div class="faces">
              @for (m of people(); track m.uid) {
                <button type="button" class="face" [class.on]="assignee() === m.uid" [attr.aria-pressed]="assignee() === m.uid"
                  [attr.aria-label]="'Filtrar por ' + m.name" [title]="m.name" (click)="toggleAssignee(m.uid)">
                  <bo-task-avatar [uid]="m.uid" [name]="m.name" [size]="30" />
                </button>
              }
            </div>
          }

          <span class="sep"></span>
          <label class="chip select">
            Área:
            <select aria-label="Filtrar por área" (change)="area.set(asArea(text($event)))">
              <option value="" [selected]="!area()">Todas</option>
              @for (a of areas; track a) {
                <option [value]="a" [selected]="area() === a">{{ areaLabels[a] }}</option>
              }
            </select>
          </label>

          <span class="spacer"></span>
          <button type="button" class="chip" [class.on]="showArchived()" (click)="toggleArchived()">
            <bo-icon name="archive" [size]="14" /> Arquivadas
          </button>
        </div>

        @if (error(); as e) {
          <div class="bo-alert" role="alert">
            <bo-icon name="alert" [size]="16" /><span>{{ e }}</span>
            <button type="button" class="bo-mini-btn push" (click)="error.set(null)">Fechar</button>
          </div>
        }

        @switch (state()) {
          @case ('loading') {
            <div class="board" aria-busy="true" aria-label="Carregando o quadro">
              @for (col of statuses; track col) {
                <div class="col skel"></div>
              }
            </div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" /><span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="listen()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (showArchived()) {
              <section class="archived" aria-label="Tarefas arquivadas">
                @if (archivedList() === null) {
                  <div class="skel small" aria-busy="true"></div>
                } @else {
                  <div class="grid">
                    @for (t of archivedVisible(); track t.id) {
                      <bo-task-card [task]="t" [today]="today" [draggable]="false" (opened)="open(t)" />
                    } @empty {
                      <p class="none">Nenhuma tarefa arquivada{{ term().trim() ? ' com "' + term().trim() + '"' : '' }}.</p>
                    }
                  </div>
                }
              </section>
            } @else {
              <div class="board">
                @for (col of statuses; track col) {
                  <section class="col" [class.drop-ok]="drop()?.status === col" [attr.aria-label]="statusLabels[col]"
                    (dragover)="onDragOver($event, col)" (dragleave)="onDragLeave($event, col)" (drop)="onDrop($event, col)">
                    <div class="col-head">
                      <span class="dot" [class]="'dot ' + col"></span>
                      <h2>{{ statusLabels[col] }}</h2>
                      <span class="n">{{ columns()[col].length }}</span>
                      <button type="button" class="add" [attr.aria-label]="'Adicionar em ' + statusLabels[col]" (click)="startQuickAdd(col)">
                        <bo-icon name="plus" [size]="14" [strokeWidth]="2.2" />
                      </button>
                    </div>

                    <div class="cards">
                      @for (t of visibleIn(col); track t.id) {
                        @if (showLine(col, t.id)) {
                          <div class="drop-line" aria-hidden="true"></div>
                        }
                        <bo-task-card [task]="t" [today]="today" [dragging]="dragId() === t.id"
                          (opened)="open(t)" (dragstart)="onDragStart($event, t)" (dragend)="onDragEnd()" />
                      } @empty {
                        @if (addingIn() !== col) {
                          <p class="none">{{ emptyText(col) }}</p>
                        }
                      }
                      @if (showLine(col, null)) {
                        <div class="drop-line" aria-hidden="true"></div>
                      }

                      @if (col === 'done' && columns().done.length > doneVisible) {
                        <button type="button" class="more" (click)="showAllDone.set(!showAllDone())">
                          {{ showAllDone() ? 'Mostrar só as recentes' : 'Ver as ' + (columns().done.length - doneVisible) + ' mais antigas' }}
                        </button>
                      }

                      @if (addingIn() === col) {
                        <label class="quick">
                          <input #quickInput type="text" maxlength="200" placeholder="Título da tarefa · Enter para criar"
                            [attr.aria-label]="'Nova tarefa em ' + statusLabels[col]" [value]="quickTitle()"
                            (input)="quickTitle.set(text($event))" (keydown.enter)="quickAdd(col)" (keydown.escape)="cancelQuickAdd()"
                            (blur)="quickTitle().trim() ? null : cancelQuickAdd()" />
                        </label>
                      }
                    </div>

                    @if (col === 'done' && columns().done.length > 0) {
                      <button type="button" class="more" [disabled]="busy()" (click)="archiveDone()">Arquivar concluídas</button>
                    }
                  </section>
                }
              </div>
            }
          }
        }
      </div>

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (drawerOpen()) {
        <bo-task-drawer
          [task]="current()"
          [initialStatus]="newStatus()"
          [members]="members()"
          [busy]="busy()"
          [error]="drawerError()"
          (saved)="save($event)"
          (archived)="archive($event)"
          (deleted)="remove()"
          (closed)="closeDrawer()"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .crumb, .kicker { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; letter-spacing: -0.01em; }
    .pill { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: var(--nx-r-pill); font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .pill.orange { color: var(--nx-orange-400); background: rgba(255, 106, 26, 0.1); border: 1px solid rgba(255, 106, 26, 0.35); }
    .pill.red { color: #ff6b61; background: rgba(255, 59, 48, 0.1); border: 1px solid rgba(255, 59, 48, 0.4); }
    .spacer { flex: 1; }
    .search { width: min(300px, 100%); height: 40px; display: flex; align-items: center; gap: 9px; padding: 0 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-dim); }
    .search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--nx-text); font-size: 14px; }
    .big { height: 40px; padding: 0 16px; font-size: 13.5px; }
    .body { flex: 1; padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .chip { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap; }
    .chip:hover { color: var(--nx-text); }
    .chip.on { color: var(--nx-text); border-color: rgba(255, 106, 26, 0.45); background: var(--nx-orange-tint); }
    .chip .n, .col-head .n { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 500; color: var(--nx-text-dim); }
    .chip.select select { border: none; outline: none; background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; }
    .chip.select select option { background: var(--nx-surface-1); }
    .sep { width: 1px; height: 22px; background: var(--nx-line-strong); margin: 0 6px; }
    .faces { display: flex; }
    .face { padding: 0; margin-left: -6px; border: 2px solid var(--nx-bg); border-radius: 999px; background: none; cursor: pointer; display: flex; }
    .face:first-child { margin-left: 0; }
    .face.on { border-color: var(--nx-orange-500); position: relative; z-index: 1; }
    .face:hover { position: relative; z-index: 2; }
    .dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
    .dot.red { background: var(--nx-live); }
    .dot.todo { background: var(--nx-text-dim); } .dot.doing { background: var(--nx-orange-500); }
    .dot.review { background: var(--nx-pending); } .dot.done { background: var(--nx-win); }
    .push { margin-left: auto; flex: none; }
    .board { display: grid; grid-template-columns: repeat(4, minmax(260px, 1fr)); gap: 16px; overflow-x: auto; align-items: stretch; padding-bottom: 4px; }
    .col { display: flex; flex-direction: column; gap: 12px; min-height: 560px; padding: 16px 14px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: rgba(255, 255, 255, 0.012); transition: border-color 120ms var(--nx-ease-out), background 120ms; }
    .col.skel { background: var(--nx-surface-0); }
    .col.drop-ok { border-color: rgba(255, 106, 26, 0.6); background: rgba(255, 106, 26, 0.06); }
    .col-head { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
    .col-head h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; }
    .add { margin-left: auto; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-mute); cursor: pointer; }
    .add:hover { color: var(--nx-text); border-color: var(--nx-line-strong); }
    .cards { flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .drop-line { height: 4px; margin: -3px 6px; border-radius: 4px; background: var(--nx-orange-500); box-shadow: 0 0 12px rgba(255, 106, 26, 0.5); }
    .none { margin: 4px; font-size: 13px; color: var(--nx-text-dim); }
    .more { align-self: flex-start; margin: 0 4px; padding: 0; border: none; background: none; color: var(--nx-text-dim); font-size: 12.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .more:hover { color: var(--nx-text); }
    .quick { display: flex; align-items: center; height: 42px; padding: 0 12px; border-radius: 12px; border: 1px dashed rgba(255, 106, 26, 0.5); background: rgba(255, 106, 26, 0.05); }
    .quick input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--nx-text); font-size: 13.5px; }
    .archived .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .skel.small { height: 200px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .sep { display: none; }
    }
  `,
})
export class PanelTarefasComponent {
  private readonly repo = inject(TasksRepository);
  private readonly team = inject(TeamRepository);
  private readonly auth = inject(AuthService);
  private readonly badges = inject(TaskBadgesService);
  private unsubscribe: (() => void) | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly today = dateKeyOf(new Date());
  protected readonly statuses = STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly areas = AREAS;
  protected readonly areaLabels = AREA_LABELS;
  protected readonly doneVisible = DONE_VISIBLE;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly tasks = signal<Task[] | null>(null);
  private readonly team$ = signal<Member[]>([]);

  protected readonly term = signal('');
  protected readonly assignee = signal<string | null>(null);
  protected readonly area = signal<TaskArea | null>(null);
  protected readonly overdueOnly = signal(false);
  protected readonly showAllDone = signal(false);
  protected readonly showArchived = signal(false);
  protected readonly archivedList = signal<Task[] | null>(null);

  protected readonly dragId = signal<string | null>(null);
  protected readonly drop = signal<DropTarget | null>(null);
  protected readonly addingIn = signal<TaskStatus | null>(null);
  protected readonly quickTitle = signal('');
  /** O campo de criar rápido nasce com foco (e o mantém entre uma criação e outra). */
  private readonly quickInput = viewChild<ElementRef<HTMLInputElement>>('quickInput');

  protected readonly openId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly newStatus = signal<TaskStatus>('todo');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly drawerError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);

  protected readonly myUid = computed(() => this.auth.user()?.uid ?? '');
  private readonly all = computed(() => this.tasks() ?? []);

  /** Equipe do backoffice + quem já aparece nas tarefas (se a lista da equipe não carregar). */
  protected readonly members = computed<Member[]>(() => {
    const map = new Map<string, string>();
    for (const m of this.team$()) map.set(m.uid, m.name);
    for (const t of this.all()) if (t.assigneeUid && !map.has(t.assigneeUid)) map.set(t.assigneeUid, t.assigneeName ?? '');
    const me = this.myUid();
    if (me && !map.has(me)) map.set(me, this.auth.displayName() ?? this.auth.user()?.email ?? 'Eu');
    return [...map].map(([uid, name]) => ({ uid, name: name || 'Sem nome' })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
  /** Quem tem tarefa aberta, com você primeiro: os avatares do filtro. */
  protected readonly people = computed(() => {
    const busy = new Set(this.all().filter((t) => t.status !== 'done').map((t) => t.assigneeUid));
    const me = this.myUid();
    return this.members()
      .filter((m) => busy.has(m.uid) || m.uid === this.assignee())
      .sort((a, b) => Number(b.uid === me) - Number(a.uid === me));
  });

  private readonly filter = computed(() => ({
    term: this.term(),
    assignee: this.assignee(),
    area: this.area(),
    overdueOnly: this.overdueOnly(),
  }));
  protected readonly columns = computed(() => byStatus(this.all().filter((t) => matchesTask(t, this.filter(), this.today))));
  private readonly allColumns = computed(() => byStatus(this.all()));

  protected readonly openCount = computed(() => this.all().filter((t) => t.status !== 'done').length);
  protected readonly overdueCount = computed(() => this.all().filter((t) => dueState(t, this.today) === 'overdue').length);
  protected readonly mineCount = computed(() => this.all().filter((t) => t.assigneeUid === this.myUid() && t.status !== 'done').length);

  protected readonly archivedVisible = computed(() =>
    (this.archivedList() ?? []).filter((t) => matchesTask(t, { ...this.filter(), overdueOnly: false }, this.today)),
  );

  protected readonly drawerOpen = computed(() => this.creating() || this.openId() !== null);
  protected readonly current = computed(() => {
    const id = this.openId();
    if (!id) return null;
    return this.all().find((t) => t.id === id) ?? this.archivedList()?.find((t) => t.id === id) ?? null;
  });

  constructor() {
    effect(() => this.quickInput()?.nativeElement.focus());
    this.listen();
    void this.loadTeam();
    inject(DestroyRef).onDestroy(() => {
      this.unsubscribe?.();
      clearTimeout(this.toastTimer);
    });
  }

  listen(): void {
    this.unsubscribe?.();
    this.state.set('loading');
    this.unsubscribe = this.repo.watchBoard(
      (tasks) => {
        this.tasks.set(tasks);
        this.state.set('ready');
        this.badges.set(myDueCount(tasks, this.myUid(), this.today));
      },
      (error) => {
        this.loadError.set(errorText(error));
        this.state.set('error');
      },
    );
  }

  private async loadTeam(): Promise<void> {
    try {
      const admins = await this.team.listAdmins();
      this.team$.set(
        admins
          .filter((u) => !u.disabled)
          .map((u) => ({ uid: u.uid, name: (u.fullName || u.displayName || u.email || '').trim() })),
      );
    } catch {
      // Sem a lista da equipe, o seletor usa quem já aparece nas tarefas.
    }
  }

  protected visibleIn(col: TaskStatus): Task[] {
    const list = this.columns()[col];
    return col === 'done' && !this.showAllDone() ? list.slice(0, DONE_VISIBLE) : list;
  }

  protected emptyText(col: TaskStatus): string {
    if (this.term().trim()) return `Nada encontrado para "${this.term().trim()}"`;
    return col === 'done' ? 'Nada concluído ainda' : 'Nenhuma tarefa aqui';
  }

  // ── filtros ──────────────────────────────────────────────────────────────

  protected clearFilters(): void {
    this.assignee.set(null);
    this.overdueOnly.set(false);
    this.showArchived.set(false);
  }

  protected toggleAssignee(uid: string): void {
    this.showArchived.set(false);
    this.assignee.set(this.assignee() === uid ? null : uid);
  }

  protected asArea(value: string): TaskArea | null {
    return (AREAS as readonly string[]).includes(value) ? (value as TaskArea) : null;
  }

  protected async toggleArchived(): Promise<void> {
    const next = !this.showArchived();
    this.showArchived.set(next);
    if (next) await this.loadArchived();
  }

  private async loadArchived(): Promise<void> {
    try {
      this.archivedList.set(await this.repo.archived());
    } catch (error) {
      this.archivedList.set([]);
      this.error.set(errorText(error));
    }
  }

  // ── criar rápido ─────────────────────────────────────────────────────────

  protected startQuickAdd(col: TaskStatus): void {
    this.quickTitle.set('');
    this.addingIn.set(col);
  }

  protected cancelQuickAdd(): void {
    this.addingIn.set(null);
    this.quickTitle.set('');
  }

  protected async quickAdd(col: TaskStatus): Promise<void> {
    const title = this.quickTitle().trim();
    if (!title || this.busy()) return;
    const draft: TaskDraft = { ...emptyDraft(col), title, area: this.area() ?? 'produto' };
    if (this.assignee()) {
      const m = this.members().find((x) => x.uid === this.assignee());
      draft.assigneeUid = this.assignee();
      draft.assigneeName = m?.name ?? null;
    }
    this.busy.set(true);
    try {
      await this.repo.create(draft, orderAtEnd(this.allColumns()[col]));
      this.quickTitle.set('');
    } catch (error) {
      this.error.set(errorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ── painel lateral ───────────────────────────────────────────────────────

  protected openNew(status: TaskStatus): void {
    this.drawerError.set(null);
    this.openId.set(null);
    this.newStatus.set(status);
    this.creating.set(true);
  }

  protected open(t: Task): void {
    this.drawerError.set(null);
    this.creating.set(false);
    this.openId.set(t.id);
  }

  protected closeDrawer(): void {
    this.creating.set(false);
    this.openId.set(null);
  }

  protected async save(draft: TaskDraft): Promise<void> {
    const task = this.current();
    await this.run(async () => {
      if (!task) {
        await this.repo.create(draft, orderAtEnd(this.allColumns()[draft.status]));
        return 'Tarefa criada';
      }
      // Mudou de coluna pelo painel: vai para o fim da nova.
      const order = draft.status !== task.status ? orderAtEnd(this.allColumns()[draft.status]) : undefined;
      await this.repo.update(task.id, draft, task.status, order);
      return 'Tarefa salva';
    });
  }

  protected async archive(archived: boolean): Promise<void> {
    const task = this.current();
    if (!task) return;
    await this.run(async () => {
      await this.repo.setArchived(task.id, archived);
      if (this.archivedList() !== null) await this.loadArchived();
      return archived ? 'Tarefa arquivada' : 'Tarefa de volta ao quadro';
    });
  }

  protected async remove(): Promise<void> {
    const task = this.current();
    if (!task) return;
    await this.run(async () => {
      await this.repo.remove(task.id);
      this.archivedList.update((list) => list?.filter((t) => t.id !== task.id) ?? null);
      return 'Tarefa excluída';
    });
  }

  protected async archiveDone(): Promise<void> {
    const ids = this.allColumns().done.map((t) => t.id);
    if (ids.length === 0 || this.busy()) return;
    this.busy.set(true);
    try {
      await this.repo.archiveAll(ids);
      this.archivedList.set(null);
      this.showToast(ids.length === 1 ? '1 tarefa arquivada' : `${ids.length} tarefas arquivadas`);
    } catch (error) {
      this.error.set(errorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.drawerError.set(null);
    try {
      const done = await action();
      this.closeDrawer();
      this.showToast(done);
    } catch (error) {
      this.drawerError.set(errorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ── arrastar ─────────────────────────────────────────────────────────────

  protected onDragStart(event: DragEvent, t: Task): void {
    event.dataTransfer?.setData('text/plain', t.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragId.set(t.id);
  }

  protected onDragEnd(): void {
    this.dragId.set(null);
    this.drop.set(null);
  }

  private dragged(): Task | null {
    const id = this.dragId();
    return id ? (this.all().find((t) => t.id === id) ?? null) : null;
  }

  protected onDragOver(event: DragEvent, col: TaskStatus): void {
    if (!this.dragged()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    // Concluído é ordenado pela data de conclusão: a posição de soltura não vale.
    const beforeId = col === 'done' ? null : this.cardBelow(event.currentTarget as HTMLElement, event.clientY);
    const now = this.drop();
    if (now?.status !== col || now.beforeId !== beforeId) this.drop.set({ status: col, beforeId });
  }

  /** Primeiro card (fora o arrastado) cujo meio está abaixo do ponteiro. */
  private cardBelow(column: HTMLElement, y: number): string | null {
    const cards = column.querySelectorAll<HTMLElement>('bo-task-card[data-task-id]');
    for (const card of Array.from(cards)) {
      const id = card.dataset['taskId'] ?? null;
      if (id === this.dragId()) continue;
      const r = card.getBoundingClientRect();
      if (y < r.top + r.height / 2) return id;
    }
    return null;
  }

  protected onDragLeave(event: DragEvent, col: TaskStatus): void {
    const to = event.relatedTarget as Node | null;
    if (to && (event.currentTarget as HTMLElement).contains(to)) return;
    if (this.drop()?.status === col) this.drop.set(null);
  }

  protected showLine(col: TaskStatus, beforeId: string | null): boolean {
    const d = this.drop();
    if (!d || d.status !== col || col === 'done' || d.beforeId !== beforeId) return false;
    // Soltar no mesmo lugar não muda nada: sem linha.
    const t = this.dragged();
    if (!t || t.status !== col) return true;
    const list = this.allColumns()[col].filter((x) => x.id !== t.id);
    const at = this.allColumns()[col].findIndex((x) => x.id === t.id);
    return (list[at]?.id ?? null) !== beforeId;
  }

  protected async onDrop(event: DragEvent, col: TaskStatus): Promise<void> {
    event.preventDefault();
    const t = this.dragged();
    const target = this.drop();
    this.onDragEnd();
    if (!t || !target) return;
    if (col === 'done' && t.status === 'done') return;
    const column = this.allColumns()[col];
    const order = col === 'done' ? t.order : orderFor(column, t.id, target.beforeId);
    if (t.status === col && order === t.order) return;
    try {
      await this.repo.move(t.id, col, order, t.status);
      if (t.status !== col) this.showToast(`Movida para ${STATUS_LABELS[col]}`);
    } catch (error) {
      this.error.set(errorText(error));
    }
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }
}
