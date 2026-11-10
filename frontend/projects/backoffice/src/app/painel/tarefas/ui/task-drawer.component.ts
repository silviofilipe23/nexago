import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import {
  AREAS,
  AREA_LABELS,
  CHECKLIST_MAX,
  CHECKLIST_TEXT_MAX,
  DESCRIPTION_MAX,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
  TITLE_MAX,
  checklistProgress,
  draftOf,
  emptyDraft,
  shortDateOf,
  type Member,
  type Task,
  type TaskArea,
  type TaskDraft,
  type TaskStatus,
} from '../data/task';

/**
 * Painel lateral da tarefa: cria (sem `task`) ou edita. O rascunho é copiado uma vez ao abrir; as
 * mudanças ao vivo de outra pessoa não atropelam o que está sendo digitado.
 */
@Component({
  selector: 'bo-task-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @let d = draft();
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="task-title-label">
      <header>
        <span class="kicker" [class]="'kicker ' + d.area">{{ areaLabels[d.area] }}</span>
        <span class="kicker dim">· {{ headerNote() }}</span>
        <button type="button" class="x" aria-label="Fechar" (click)="closed.emit()">
          <bo-icon name="plus" [size]="16" class="rot" />
        </button>
      </header>

      <div class="body">
        <label class="fld">
          <span class="lbl" id="task-title-label">Título</span>
          <textarea #titleInput class="title-input" rows="2" [maxLength]="titleMax" placeholder="O que precisa ser feito?"
            [value]="d.title" (input)="patch({ title: text($event) })" (keydown.enter)="$event.preventDefault()"></textarea>
        </label>

        <div class="fld">
          <span class="lbl" id="task-status-label">Etapa</span>
          <div class="seg" role="radiogroup" aria-labelledby="task-status-label">
            @for (s of statuses; track s) {
              <button type="button" role="radio" [class.on]="d.status === s" [attr.aria-checked]="d.status === s" (click)="patch({ status: s })">
                <span class="dot" [class]="'dot ' + s"></span>{{ statusLabels[s] }}
              </button>
            }
          </div>
        </div>

        <div class="grid">
          <label class="fld">
            <span class="lbl">Responsável</span>
            <select class="bo-select" [value]="d.assigneeUid ?? ''" (change)="pickAssignee($event)">
              <option value="">Sem responsável</option>
              @for (m of memberOptions(); track m.uid) {
                <option [value]="m.uid" [selected]="m.uid === d.assigneeUid">{{ m.name }}</option>
              }
            </select>
          </label>
          <label class="fld">
            <span class="lbl">Prazo</span>
            <input class="bo-input date" type="date" [value]="d.dueDate ?? ''" (change)="patch({ dueDate: text($event) || null })" />
          </label>
          <label class="fld">
            <span class="lbl">Área</span>
            <select class="bo-select" (change)="patch({ area: asArea(text($event)) })">
              @for (a of areas; track a) {
                <option [value]="a" [selected]="a === d.area">{{ areaLabels[a] }}</option>
              }
            </select>
          </label>
          <div class="fld">
            <span class="lbl" id="task-priority-label">Prioridade</span>
            <div class="seg tight" role="radiogroup" aria-labelledby="task-priority-label">
              @for (p of priorities; track p) {
                <button type="button" role="radio" [class.on]="d.priority === p" [class.urgent]="p === 'urgent'"
                  [attr.aria-checked]="d.priority === p" (click)="patch({ priority: p })">{{ priorityLabels[p] }}</button>
              }
            </div>
          </div>
        </div>

        <label class="fld">
          <span class="lbl">Descrição</span>
          <textarea class="bo-input area-input" rows="4" [maxLength]="descriptionMax" placeholder="Contexto, links, o que é “pronto”…"
            [value]="d.description" (input)="patch({ description: text($event) })"></textarea>
        </label>

        <div class="fld">
          <div class="check-head">
            <span class="lbl">Checklist</span>
            @if (checks().total > 0) {
              <span class="count">{{ checks().done }}/{{ checks().total }}</span>
              <div class="bar"><div [style.width.%]="(checks().done / checks().total) * 100"></div></div>
            }
          </div>
          <ul class="checklist">
            @for (item of d.checklist; track item.id) {
              <li class="item" [class.on]="item.done">
                <label class="box-wrap">
                  <input type="checkbox" [checked]="item.done" (change)="toggleItem(item.id)" [attr.aria-label]="item.text" />
                  <span class="box" aria-hidden="true"><bo-icon name="check" [size]="11" [strokeWidth]="3" /></span>
                </label>
                <span class="item-text">{{ item.text }}</span>
                <button type="button" class="item-x" [attr.aria-label]="'Remover ' + item.text" (click)="removeItem(item.id)">
                  <bo-icon name="trash" [size]="13" />
                </button>
              </li>
            }
            @if (d.checklist.length < checklistMax) {
              <li class="item add">
                <bo-icon name="plus" [size]="14" />
                <input type="text" [maxLength]="checklistTextMax" placeholder="Adicionar item · Enter" aria-label="Novo item do checklist"
                  [value]="newItem()" (input)="newItem.set(text($event))" (keydown.enter)="addItem($event)" />
              </li>
            }
          </ul>
        </div>

        @if (task(); as t) {
          <p class="trail">
            Criada por {{ t.createdByName || 'alguém da equipe' }}{{ t.createdAt ? ' em ' + date(t.createdAt) : '' }}
            @if (t.updatedAt && t.updatedByName) {
              · atualizada por {{ t.updatedByName }} em {{ date(t.updatedAt) }}
            }
          </p>
        }

        @if (error(); as e) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
        }
      </div>

      <footer>
        @if (task(); as t) {
          @if (confirmDelete()) {
            <span class="ask">Excluir de vez?</span>
            <button type="button" class="bo-mini-btn danger" [disabled]="busy()" (click)="deleted.emit()">Excluir</button>
            <button type="button" class="bo-mini-btn ghost" [disabled]="busy()" (click)="confirmDelete.set(false)">Não</button>
          } @else {
            <button type="button" class="bo-mini-btn danger-ghost" [disabled]="busy()" (click)="confirmDelete.set(true)">
              <bo-icon name="trash" [size]="14" /> Excluir
            </button>
            <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="archived.emit(!t.archived)">
              <bo-icon name="archive" [size]="14" /> {{ t.archived ? 'Desarquivar' : 'Arquivar' }}
            </button>
          }
        }
        <span class="grow"></span>
        <button type="button" class="bo-mini-btn ghost" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary save" [disabled]="busy() || !canSave()" (click)="save()">
          @if (busy()) {
            <span class="bo-spinner small" aria-hidden="true"></span>
          }
          {{ task() ? 'Salvar' : 'Criar tarefa' }}
        </button>
      </footer>
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.6); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(540px, 100%); display: flex; flex-direction: column; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 60px rgba(0, 0, 0, 0.5); }
    header { display: flex; align-items: center; gap: 8px; padding: 16px 22px; border-bottom: 1px solid var(--nx-line); }
    .kicker { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kicker.dim { font-weight: 500; }
    .produto { color: #ff8a4a; } .comercial { color: #5aa9ff; } .operacao { color: #2bd17e; }
    .marketing { color: #ff7ab6; } .financeiro { color: #f4c543; } .suporte { color: #a78bfa; }
    .x { margin-left: auto; flex: none; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); color: var(--nx-text-mute); cursor: pointer; }
    .x:hover { color: var(--nx-text); }
    .rot { transform: rotate(45deg); display: flex; }
    .body { flex: 1; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 20px; }
    .fld { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-input { padding: 0; border: none; outline: none; resize: none; background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 700; font-size: 20px; line-height: 1.3; letter-spacing: -0.01em; }
    .title-input:focus-visible { outline: none; box-shadow: 0 2px 0 rgba(255, 106, 26, 0.6); }
    .seg { display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: var(--nx-bg); border: 1px solid var(--nx-line); }
    .seg button { flex: 1; min-width: 0; height: 36px; padding: 0 6px; border-radius: 8px; border: none; background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
    .seg button:hover { color: var(--nx-text); }
    .seg button.on { background: var(--nx-surface-2); color: var(--nx-text); box-shadow: inset 0 0 0 1px var(--nx-line-strong); }
    .seg button.on.urgent { color: #ff6b61; }
    .seg.tight { padding: 3px; }
    .seg.tight button { height: 34px; font-size: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
    .dot.todo { background: var(--nx-text-dim); } .dot.doing { background: var(--nx-orange-500); }
    .dot.review { background: var(--nx-pending); } .dot.done { background: var(--nx-win); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .date { color-scheme: dark; }
    .area-input { height: auto; padding: 12px 13px; line-height: 1.5; resize: vertical; }
    .check-head { display: flex; align-items: center; gap: 10px; }
    .count { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .bar { flex: 1; height: 4px; border-radius: 4px; background: var(--nx-surface-2); overflow: hidden; }
    .bar div { height: 100%; background: var(--nx-win); transition: width 200ms var(--nx-ease-out); }
    .checklist { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .item { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 6px 0 10px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 13.5px; }
    .item.on .item-text { color: var(--nx-text-dim); text-decoration: line-through; }
    .box-wrap { position: relative; display: flex; cursor: pointer; }
    .box-wrap input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .box { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid rgba(244, 244, 245, 0.4); display: flex; align-items: center; justify-content: center; color: transparent; }
    .item.on .box { background: var(--nx-win); border-color: var(--nx-win); color: #0a0a0a; }
    .box-wrap input:focus-visible + .box { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .item-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .item-x { flex: none; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 8px; background: transparent; color: var(--nx-text-dim); cursor: pointer; opacity: 0; }
    .item:hover .item-x, .item-x:focus-visible { opacity: 1; }
    .item-x:hover { color: #ff6b61; background: rgba(255, 59, 48, 0.08); }
    .item.add { background: transparent; border: 1px dashed rgba(255, 255, 255, 0.14); color: var(--nx-text-dim); }
    .item.add input { flex: 1; min-width: 0; height: 38px; border: none; outline: none; background: transparent; color: var(--nx-text); font-size: 13.5px; }
    .trail { margin: 0; font-size: 12px; color: var(--nx-text-dim); }
    footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 14px 22px; border-top: 1px solid var(--nx-line); }
    footer .bo-mini-btn { height: 38px; padding: 0 14px; font-size: 13px; }
    .grow { flex: 1; }
    .ghost { background: transparent; border-color: transparent; color: var(--nx-text-mute); }
    .danger-ghost { background: transparent; color: #ff6b61; border-color: rgba(255, 59, 48, 0.35); }
    .danger { background: #ff3b30; color: #fff; border: none; }
    .ask { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: #ff6b61; }
    .save { padding: 0 18px; }
    @media (max-width: 560px) {
      .grid { grid-template-columns: 1fr; }
      .seg { flex-wrap: wrap; }
      .seg button { flex: 1 1 45%; }
    }
  `,
})
export class TaskDrawerComponent {
  /** `null` = tarefa nova. */
  readonly task = input<Task | null>(null);
  readonly initialStatus = input<TaskStatus>('todo');
  readonly members = input<Member[]>([]);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly saved = output<TaskDraft>();
  readonly archived = output<boolean>();
  readonly deleted = output<void>();
  readonly closed = output<void>();

  protected readonly statuses = STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorities = PRIORITIES;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly areas = AREAS;
  protected readonly areaLabels = AREA_LABELS;
  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly checklistMax = CHECKLIST_MAX;
  protected readonly checklistTextMax = CHECKLIST_TEXT_MAX;

  /** Recopia só quando troca de tarefa, não a cada snapshot da mesma. */
  protected readonly draft = linkedSignal<string, TaskDraft>({
    source: () => this.task()?.id ?? '',
    computation: () =>
      untracked(() => {
        const t = this.task();
        return t ? draftOf(t) : emptyDraft(this.initialStatus());
      }),
  });
  protected readonly newItem = signal('');
  protected readonly confirmDelete = signal(false);

  protected readonly checks = computed(() => checklistProgress(this.draft().checklist));
  protected readonly canSave = computed(() => this.draft().title.trim().length > 0);
  protected readonly headerNote = computed(() => (this.task() ? STATUS_LABELS[this.task()!.status] : 'Nova tarefa'));

  /** A pessoa atribuída continua na lista mesmo se saiu da equipe. */
  protected readonly memberOptions = computed(() => {
    const list = [...this.members()];
    const d = this.draft();
    if (d.assigneeUid && !list.some((m) => m.uid === d.assigneeUid)) {
      list.push({ uid: d.assigneeUid, name: d.assigneeName ?? 'Ex-integrante' });
    }
    return list;
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => {
      if (!this.task()) host.nativeElement.querySelector<HTMLTextAreaElement>('.title-input')?.focus();
    });
  }

  protected patch(change: Partial<TaskDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected pickAssignee(event: Event): void {
    const uid = this.text(event) || null;
    const member = this.memberOptions().find((m) => m.uid === uid);
    this.patch({ assigneeUid: uid, assigneeName: member?.name ?? null });
  }

  protected asArea(value: string): TaskArea {
    return (AREAS as readonly string[]).includes(value) ? (value as TaskArea) : 'produto';
  }

  protected toggleItem(id: string): void {
    this.patch({ checklist: this.draft().checklist.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) });
  }

  protected removeItem(id: string): void {
    this.patch({ checklist: this.draft().checklist.filter((i) => i.id !== id) });
  }

  protected addItem(event: Event): void {
    event.preventDefault();
    const value = this.newItem().trim();
    if (!value) return;
    this.patch({ checklist: [...this.draft().checklist, { id: crypto.randomUUID().slice(0, 8), text: value, done: false }] });
    this.newItem.set('');
  }

  protected save(): void {
    if (this.canSave() && !this.busy()) this.saved.emit(this.draft());
  }

  protected onEscape(): void {
    if (this.confirmDelete()) this.confirmDelete.set(false);
    else this.closed.emit();
  }

  protected date(value: Date): string {
    return shortDateOf(value);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
