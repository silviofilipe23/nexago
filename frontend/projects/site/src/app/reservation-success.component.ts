import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface ReservationSummary {
  arena: string;
  date: string;
  time: string;
}

@Component({
  selector: 'app-reservation-success',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './reservation-success.component.html',
  styleUrls: ['./reservation-success.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationSuccessComponent {
  private readonly route = inject(ActivatedRoute);

  readonly reservation = computed<ReservationSummary>(() => {
    const qp = this.route.snapshot.queryParamMap;
    return {
      arena: qp.get('arena') ?? 'Arena Central',
      date: qp.get('date') ?? '09 Abril',
      time: qp.get('time') ?? '18:00',
    };
  });

  addToCalendar(): void {
    const url =
      'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Jogo%20NexaGO&dates=20250409T180000/20250409T190000';
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }

  async shareReservation(): Promise<void> {
    if (!navigator.share) {
      return;
    }
    await navigator.share({
      title: 'Meu jogo no NexaGO',
      text: `Reservei a ${this.reservation().arena}. Bora jogar?`,
      url: globalThis.location.href,
    });
  }
}
