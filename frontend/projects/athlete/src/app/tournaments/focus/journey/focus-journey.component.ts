import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TournamentLiveStore } from '../../tournament-live.store';

@Component({
  selector: 'app-focus-journey',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusJourneyComponent {
  protected readonly store = inject(TournamentLiveStore);
}
