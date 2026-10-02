import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrganizerEventCardComponent } from './organizer-event-card.component';
import { OrganizerHistoryListComponent } from './organizer-history-list.component';
import { HISTORY_PREVIEW, OrganizerProfileStore } from './organizer-profile.store';
import {
  openRegistrationCaption,
  organizerEventCardVm,
  organizerHistoryRowVm,
  organizerReputationVm,
} from './organizer-profile.vm';
import { OrganizerReputationCardComponent } from './organizer-reputation-card.component';

/** Até 3 próximos na visão geral (spec). */
const UPCOMING_PREVIEW = 3;

/** Aba "Visão geral": próximos eventos, histórico e, na lateral, bio, locais e reputação. */
@Component({
  selector: 'app-organizer-overview-tab',
  imports: [RouterLink, OrganizerEventCardComponent, OrganizerHistoryListComponent, OrganizerReputationCardComponent],
  templateUrl: './organizer-overview-tab.component.html',
  styleUrl: './organizer-overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerOverviewTabComponent {
  protected readonly store = inject(OrganizerProfileStore);

  protected readonly cards = computed(() => {
    const enrolled = this.store.enrolled();
    const now = this.store.now();
    return this.store
      .upcoming()
      .slice(0, UPCOMING_PREVIEW)
      .map((e) => organizerEventCardVm(e, enrolled.get(e.summary.id) ?? null, now));
  });

  protected readonly caption = computed(() => openRegistrationCaption(this.store.upcoming(), this.store.now()));
  protected readonly upcomingCount = computed(() => this.store.upcoming().length);

  protected readonly history = computed(() => {
    const enrolled = this.store.enrolled();
    const names = this.store.teamNames();
    return this.store
      .realized()
      .slice(0, HISTORY_PREVIEW)
      .map((e) => organizerHistoryRowVm(e, enrolled.get(e.summary.id) ?? null, names));
  });

  protected readonly realizedCount = computed(() => this.store.realized().length);
  protected readonly bio = computed(() => this.store.profile()?.bio ?? null);
  protected readonly venues = computed(() => this.store.profile()?.stats.venues ?? []);
  protected readonly name = computed(() => this.store.profile()?.name ?? 'o organizador');
  protected readonly reputation = computed(() => organizerReputationVm(this.store.reputation()));
}
