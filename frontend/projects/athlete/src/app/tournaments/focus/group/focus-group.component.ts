import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TournamentLiveStore } from '../../tournament-live.store';

@Component({
  selector: 'app-focus-group',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusGroupComponent {
  protected readonly store = inject(TournamentLiveStore);
}
