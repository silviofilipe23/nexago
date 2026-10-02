import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrganizerProfileStore } from './organizer-profile.store';
import { organizerResultVm } from './organizer-profile.vm';

/** Aba "Resultados": eventos realizados com o campeão de cada categoria. */
@Component({
  selector: 'app-organizer-results-tab',
  imports: [RouterLink],
  template: `
    @if (results().length > 0) {
      <ul class="rt-list">
        @for (r of results(); track r.id) {
          <li class="rt-card">
            <a class="rt-head" [routerLink]="r.link">
              <span class="rt-name">{{ r.name }}</span>
              <span class="rt-meta">{{ r.sportLabel ? r.dateLabel + ' · ' + r.sportLabel : r.dateLabel }}</span>
            </a>
            @if (r.champions.length > 0) {
              <ul class="rt-champions">
                @for (c of r.champions; track $index) {
                  <li>
                    <span class="rt-category">{{ c.categoryName }}</span>
                    <span class="rt-team">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>
                      {{ c.teamName ?? '—' }}
                    </span>
                  </li>
                }
              </ul>
            } @else {
              <p class="rt-none">Campeões não registrados.</p>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="rt-empty">Nenhum evento realizado ainda.</p>
    }
  `,
  styleUrl: './organizer-results-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerResultsTabComponent {
  private readonly store = inject(OrganizerProfileStore);

  protected readonly results = computed(() => {
    const names = this.store.teamNames();
    return this.store.realized().map((e) => organizerResultVm(e, names));
  });

  constructor() {
    void this.store.ensureAllDetails();
  }
}
