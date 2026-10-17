import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TIER_LABELS, type SquadTier } from '../data/squad-rules';

/** Pílula do nível (ponto colorido + nome em mono): cinza no Athlete, laranja na escada, amarela no Captain. */
@Component({
  selector: 'bo-tier-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill t-' + tier()" [class.sm]="size() === 'sm'"><i></i>{{ label() }}</span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    .pill { display: inline-flex; align-items: center; gap: 7px; height: 26px; padding: 0 11px 0 10px; border-radius: var(--nx-r-pill); background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text); white-space: nowrap; }
    .pill.sm { height: 22px; padding: 0 9px 0 8px; gap: 6px; font-size: 9px; }
    i { width: 6px; height: 6px; border-radius: 50%; background: var(--nx-text-mute); }
    .t-amb i, .t-pro i { background: var(--nx-orange-500); }
    .t-cap i { background: var(--nx-pending); }
  `,
})
export class TierPillComponent {
  readonly tier = input.required<SquadTier>();
  readonly size = input<'md' | 'sm'>('md');
  protected readonly label = computed(() => TIER_LABELS[this.tier()]);
}
