import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { TIER_META, type SquadTier } from '../../../lib/squad';

/** Selo do nível do programa (Athlete, Ambassador, Pro Ambassador, Captain). `solid` vai sobre foto. */
@Component({
  selector: 'app-squad-tier-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (solid()) {
      <span
        class="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-pill px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-on-brand"
        [class]="meta().bg"
      >
        {{ meta().label }}
      </span>
    } @else {
      <span
        class="inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-line-strong bg-surface-2 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg"
      >
        <i class="size-1.5 rounded-pill" [class]="meta().dot" aria-hidden="true"></i>
        {{ meta().label }}
      </span>
    }
  `,
})
export class SquadTierBadge {
  readonly tier = input.required<SquadTier>();
  readonly solid = input(false, { transform: booleanAttribute });

  protected readonly meta = computed(() => TIER_META[this.tier()]);
}
