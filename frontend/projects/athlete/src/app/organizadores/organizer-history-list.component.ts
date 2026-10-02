import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrganizerHistoryRowVm } from './organizer-profile.vm';

/** Linhas de eventos realizados (visão geral e aba Eventos): data, duplas e campeões. */
@Component({
  selector: 'app-organizer-history-list',
  imports: [RouterLink],
  template: `
    <ul class="hl">
      @for (r of rows(); track r.id) {
        <li>
          <a class="hl-row" [routerLink]="r.link">
            <span class="hl-main">
              <span class="hl-name">{{ r.name }}</span>
              @if (r.sportLabel) {
                <span class="hl-sport">{{ r.sportLabel }}</span>
              }
            </span>
            <span class="hl-date">{{ r.dateLabel }}</span>
            <span class="hl-teams">{{ r.teamsLabel ?? '—' }}</span>
            <span class="hl-champ">
              @if (r.championsLabel) {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>
                <span class="hl-champ-text">{{ r.championsLabel }}</span>
              }
            </span>
            <svg class="hl-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </a>
        </li>
      }
    </ul>
  `,
  styleUrl: './organizer-history-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerHistoryListComponent {
  readonly rows = input.required<readonly OrganizerHistoryRowVm[]>();
}
