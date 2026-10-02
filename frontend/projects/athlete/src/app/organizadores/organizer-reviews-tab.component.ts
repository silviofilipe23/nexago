import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrganizerProfileStore } from './organizer-profile.store';
import { organizerReviewsVm } from './organizer-profile.vm';

const STAR_SLOTS = [1, 2, 3, 4, 5] as const;

/** Aba "Avaliações": nota geral, distribuição de 1 a 5, os 5 aspectos e a nota de cada evento
 *  (resumos fechados com 3+ avaliações). Sem texto de comentário. */
@Component({
  selector: 'app-organizer-reviews-tab',
  imports: [RouterLink],
  templateUrl: './organizer-reviews-tab.component.html',
  styleUrl: './organizer-reviews-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerReviewsTabComponent {
  private readonly store = inject(OrganizerProfileStore);

  protected readonly vm = computed(() =>
    organizerReviewsVm(this.store.reputation(), this.store.reviewSummaries(), new Set(this.store.events().map((e) => e.summary.id))),
  );
  protected readonly stars = STAR_SLOTS;
}
