import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import {
  AREA_LABELS,
  PRIORITY_LABELS,
  checklistProgress,
  dueLabel,
  dueState,
  shortDateOf,
  type Task,
} from '../data/task';
import { TaskAvatarComponent } from './task-avatar.component';

/** Card do quadro: área, título, 1 linha de descrição, prioridade, prazo, checklist e responsável. */
@Component({
  selector: 'bo-task-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TaskAvatarComponent],
  host: {
    role: 'button',
    tabindex: '0',
    '[attr.data-task-id]': 'task().id',
    '[attr.draggable]': 'draggable()',
    '[class.dragging]': 'dragging()',
    '[class.done]': "task().status === 'done'",
    '[attr.aria-label]': "'Abrir tarefa: ' + task().title",
    '(click)': 'opened.emit()',
    '(keydown.enter)': 'opened.emit()',
    '(keydown.space)': '$event.preventDefault(); opened.emit()',
  },
  template: `
    <span class="area" [class]="'area ' + task().area">{{ areaLabel() }}</span>
    <div class="title">{{ task().title }}</div>
    @if (task().description) {
      <p class="desc">{{ task().description }}</p>
    }
    <div class="foot">
      @if (task().status === 'done') {
        <span class="meta win"><bo-icon name="check" [size]="11" [strokeWidth]="2.6" />{{ doneLabel() }}</span>
      } @else {
        @if (task().priority !== 'medium' || !due()) {
          <span class="meta" [class]="'meta prio-' + task().priority">{{ priorityLabel() }}</span>
        }
        @if (due(); as d) {
          <span class="meta" [class.late]="d.state === 'overdue'" [class.today]="d.state === 'today'">
            <bo-icon name="clock" [size]="11" [strokeWidth]="2.2" />{{ d.state === 'overdue' ? 'Atrasada · ' + d.label : d.label }}
          </span>
        }
      }
      @if (checks().total > 0) {
        <span class="meta" [class.win]="checks().done === checks().total">
          <bo-icon name="check" [size]="11" [strokeWidth]="2.4" />{{ checks().done }}/{{ checks().total }}
        </span>
      }
      <bo-task-avatar class="who" [uid]="task().assigneeUid" [name]="task().assigneeName" [size]="26" />
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 9px; padding: 14px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); cursor: grab; user-select: none; transition: border-color 140ms var(--nx-ease-out), opacity 140ms; }
    :host(:hover) { border-color: var(--nx-line-strong); }
    :host(:focus-visible) { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    :host(.dragging) { opacity: 0.4; border-style: dashed; }
    :host(.done) { opacity: 0.72; }
    :host(.done) .title { text-decoration: line-through; text-decoration-color: rgba(244, 244, 245, 0.35); }
    .area { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .produto { color: #ff8a4a; }
    .comercial { color: #5aa9ff; }
    .operacao { color: #2bd17e; }
    .marketing { color: #ff7ab6; }
    .financeiro { color: #f4c543; }
    .suporte { color: #a78bfa; }
    .title { font-family: var(--nx-font-display); font-weight: 600; font-size: 14px; line-height: 1.35; color: var(--nx-text); overflow-wrap: anywhere; }
    .desc { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--nx-text-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 1px; }
    .meta { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border-radius: var(--nx-r-pill); background: var(--nx-surface-1); font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 600; color: var(--nx-text-mute); white-space: nowrap; }
    .meta.prio-low { color: var(--nx-text-dim); }
    .meta.prio-high { color: #ff8a4a; background: rgba(255, 106, 26, 0.1); }
    .meta.prio-urgent, .meta.late { color: #ff6b61; background: rgba(255, 59, 48, 0.1); }
    .meta.today { color: var(--nx-pending); background: rgba(244, 197, 67, 0.1); }
    .meta.win { color: var(--nx-win); background: rgba(43, 209, 126, 0.1); }
    .who { margin-left: auto; }
  `,
})
export class TaskCardComponent {
  readonly task = input.required<Task>();
  readonly today = input.required<string>();
  readonly draggable = input(true);
  readonly dragging = input(false);
  readonly opened = output<void>();

  protected readonly areaLabel = computed(() => AREA_LABELS[this.task().area]);
  protected readonly priorityLabel = computed(() => PRIORITY_LABELS[this.task().priority]);
  protected readonly checks = computed(() => checklistProgress(this.task().checklist));
  protected readonly due = computed(() => {
    const t = this.task();
    const state = dueState(t, this.today());
    return state && t.dueDate ? { state, label: dueLabel(t.dueDate, this.today()) } : null;
  });
  protected readonly doneLabel = computed(() => {
    const at = this.task().doneAt;
    return at ? shortDateOf(at) : 'Feita';
  });
}
