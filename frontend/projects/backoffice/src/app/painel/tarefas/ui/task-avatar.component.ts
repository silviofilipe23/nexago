import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initialsOf, toneOf } from '../data/task';

/** Iniciais do responsável com a cor fixa da pessoa; sem responsável vira um "?" tracejado. */
@Component({
  selector: 'bo-task-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'tone()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
    '[attr.title]': 'name() || "Sem responsável"',
  },
  template: `{{ initials() }}`,
  styles: `
    :host { flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.12); font-family: var(--nx-font-display); font-weight: 700; line-height: 1; }
    :host(.none) { background: rgba(255, 255, 255, 0.04); color: var(--nx-text-dim); border-style: dashed; border-color: rgba(255, 255, 255, 0.22); }
    :host(.orange) { background: rgba(255, 106, 26, 0.18); color: #ff8a4a; }
    :host(.blue) { background: rgba(90, 169, 255, 0.18); color: #8cc4ff; }
    :host(.green) { background: rgba(43, 209, 126, 0.18); color: #5be39e; }
    :host(.purple) { background: rgba(167, 139, 250, 0.18); color: #c4b5fd; }
    :host(.pink) { background: rgba(255, 122, 182, 0.18); color: #ffa3cd; }
    :host(.yellow) { background: rgba(244, 197, 67, 0.18); color: #f7d470; }
  `,
})
export class TaskAvatarComponent {
  readonly uid = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly size = input(26);

  protected readonly tone = computed(() => {
    const uid = this.uid();
    return uid ? toneOf(uid) : 'none';
  });
  protected readonly initials = computed(() => (this.uid() ? initialsOf(this.name() ?? '') : '?'));
}
