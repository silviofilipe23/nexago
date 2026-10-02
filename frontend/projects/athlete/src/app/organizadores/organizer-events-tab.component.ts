import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { OrganizerEventCardComponent } from './organizer-event-card.component';
import { OrganizerHistoryListComponent } from './organizer-history-list.component';
import { OrganizerProfileStore } from './organizer-profile.store';
import { organizerEventCardVm, organizerHistoryRowVm } from './organizer-profile.vm';

/** Aba "Eventos": todos os próximos (cards) e todos os realizados (linhas), em grupos. */
@Component({
  selector: 'app-organizer-events-tab',
  imports: [OrganizerEventCardComponent, OrganizerHistoryListComponent],
  template: `
    <section class="et-section" aria-labelledby="et-upcoming">
      <h2 class="et-title" id="et-upcoming">Próximos <span class="et-count">{{ cards().length }}</span></h2>
      @if (cards().length > 0) {
        <div class="et-cards">
          @for (card of cards(); track card.id) {
            <app-organizer-event-card [vm]="card" />
          }
        </div>
      } @else {
        <p class="et-empty">Nenhum evento agendado no momento.</p>
      }
    </section>

    <section class="et-section" aria-labelledby="et-done">
      <h2 class="et-title" id="et-done">Realizados <span class="et-count">{{ rows().length }}</span></h2>
      @if (rows().length > 0) {
        <div class="et-card">
          <app-organizer-history-list [rows]="rows()" />
        </div>
      } @else {
        <p class="et-empty">Nenhum evento realizado ainda.</p>
      }
    </section>
  `,
  styleUrl: './organizer-events-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerEventsTabComponent {
  private readonly store = inject(OrganizerProfileStore);

  protected readonly cards = computed(() => {
    const enrolled = this.store.enrolled();
    const now = this.store.now();
    return this.store.upcoming().map((e) => organizerEventCardVm(e, enrolled.get(e.summary.id) ?? null, now));
  });

  protected readonly rows = computed(() => {
    const enrolled = this.store.enrolled();
    const names = this.store.teamNames();
    return this.store.realized().map((e) => organizerHistoryRowVm(e, enrolled.get(e.summary.id) ?? null, names));
  });

  constructor() {
    // Inscritos e campeões de todos os eventos: só quando esta aba abre.
    void this.store.ensureEventsTabDetails();
  }
}
