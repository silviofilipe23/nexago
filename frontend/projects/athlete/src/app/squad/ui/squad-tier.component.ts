import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TIER_LABELS } from '../data/squad-model';
import type { SquadTier } from '../data/squad-view';

/** Chip do nível do Squad (EmTier do desenho): ponto colorido, ou cheio com `solid`. */
@Component({
  selector: 'app-squad-tier',
  template: `<span class="sq-tier" [class.sq-tier--solid]="solid()" [class.sq-tier--sm]="small()" [attr.data-tier]="tier()">
    @if (!solid()) {
      <i aria-hidden="true"></i>
    }
    {{ label() }}
  </span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .sq-tier {
      --tier: rgba(244, 244, 245, 0.62);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 24px;
      padding: 0 10px;
      border-radius: var(--nx-r-pill);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .sq-tier i {
      width: 6px;
      height: 6px;
      border-radius: 99px;
      background: var(--tier);
    }
    .sq-tier[data-tier='amb'] {
      --tier: #ff8a4a;
    }
    .sq-tier[data-tier='pro'] {
      --tier: #ff6a1a;
    }
    .sq-tier[data-tier='cap'] {
      --tier: #f4c543;
    }
    .sq-tier--solid {
      background: var(--tier);
      border-color: var(--tier);
      color: #0a0a0a;
    }
    .sq-tier--sm {
      height: 20px;
      padding: 0 8px;
      font-size: 9px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadTierComponent {
  readonly tier = input.required<SquadTier>();
  readonly solid = input(false);
  readonly small = input(false);
  protected readonly label = computed(() => TIER_LABELS[this.tier()]);
}
