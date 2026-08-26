import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_META } from '../../../lib/format';
import type { TournamentListingStatus } from '../../../lib/firestore/types';

const TONE_CLASSES: Record<string, string> = {
  live: 'border-live/30 bg-live/10 text-live',
  open: 'border-brand/30 bg-brand-tint text-brand',
  pending: 'border-pending/30 bg-pending/10 text-pending',
  muted: 'border-line-strong bg-surface-2 text-text-mute',
};

/** Badge de status de torneio — usado nas listagens e no detalhe. */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <span class="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-600" [class]="toneClass()">
      @if (meta().tone === 'live') {
        <span class="relative flex size-1.5">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-70"></span>
          <span class="relative inline-flex size-1.5 rounded-full bg-live"></span>
        </span>
      }
      {{ meta().label }}
    </span>
  `,
})
export class StatusBadge {
  readonly status = input.required<TournamentListingStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
  protected readonly toneClass = computed(() => TONE_CLASSES[this.meta().tone]);
}
