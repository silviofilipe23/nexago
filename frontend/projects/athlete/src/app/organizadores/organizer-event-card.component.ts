import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrganizerEventCardVm } from './organizer-profile.vm';

/** Card de evento do organizador (próximos): selo, tipo, data, local, vagas, preço e CTA. */
@Component({
  selector: 'app-organizer-event-card',
  imports: [RouterLink],
  templateUrl: './organizer-event-card.component.html',
  styleUrl: './organizer-event-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerEventCardComponent {
  readonly vm = input.required<OrganizerEventCardVm>();

  protected readonly coverFailed = signal(false);
}
