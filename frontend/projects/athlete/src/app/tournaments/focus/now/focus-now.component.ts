import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TournamentLiveStore } from '../../tournament-live.store';

@Component({
  selector: 'app-focus-now',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusNowComponent {
  protected readonly store = inject(TournamentLiveStore);
}
