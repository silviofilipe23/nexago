import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { publicAspectRows, type PublicReviewSummary } from '../../../lib/tournament-reviews';

/** "Como os atletas avaliaram" (spec §5): média de cada aspecto com nota. Some abaixo de 3
 *  avaliações e quando nenhum aspecto foi avaliado. */
@Component({
  selector: 'app-tournament-review-aspects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <section class="mt-12">
        <h2 class="font-display text-xl font-700 tracking-tight text-fg">Como os atletas avaliaram</h2>
        <ul class="mt-5 flex flex-col gap-4 rounded-5 border border-line bg-surface-1 p-6">
          @for (row of rows(); track row.key) {
            <li>
              <div class="flex items-baseline justify-between gap-4 text-sm">
                <span data-label class="font-600 text-fg">{{ row.label }}</span>
                <span data-value class="font-mono text-text-mute">{{ row.value }}</span>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-pill bg-surface-2">
                <span data-bar class="block h-full rounded-pill bg-brand" [style.width.%]="row.pct"></span>
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class TournamentReviewAspects {
  readonly summary = input<PublicReviewSummary | null>(null);
  protected readonly rows = computed(() => publicAspectRows(this.summary()));
}
