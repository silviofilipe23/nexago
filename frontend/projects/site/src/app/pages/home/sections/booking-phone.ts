import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PhoneAppShell } from '../../../shared/ui/phone-app-shell';
import { BOOKING, COURTS, freeTimes, isChosen, type BookingStep } from './booking-beats';

/** Esportes na fileira de filtros da busca; o da reserva vem logo depois de "Todos". */
const SPORT_CHIPS = ['Todos', BOOKING.sport, 'Vôlei de praia', 'Padel'];

/**
 * A tela do app em cada etapa da reserva, com os rótulos do app de verdade ("Buscar horários",
 * "Confirmar reserva", "Pagar online", "Ver na agenda"). As duas primeiras etapas são a mesma
 * tela de busca, antes e depois de escolher o esporte. Vai dentro de um `app-phone-frame`.
 */
@Component({
  selector: 'app-booking-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneAppShell],
  host: { class: 'block h-full' },
  templateUrl: './booking-phone.html',
  styles: `
    .screen {
      animation: fade 420ms ease both;
    }

    .pop {
      animation: pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes pop {
      from {
        opacity: 0;
        transform: scale(0.5);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `,
})
export class BookingPhone {
  readonly step = input.required<BookingStep>();

  protected readonly booking = BOOKING;
  protected readonly sports = SPORT_CHIPS;
  protected readonly isChosen = isChosen;

  /** Quadras com pelo menos um horário livre, como a tela "Horários" lista. */
  protected readonly courts = COURTS.map((court) => ({ court, times: freeTimes(court) }));

  /** Qual das quatro telas está aberta (busca cobre as etapas `search` e `sport`). */
  protected readonly screen = computed(() => (this.step() === 'sport' ? 'search' : this.step()));
  protected readonly sportChosen = computed(() => this.step() !== 'search');
}
