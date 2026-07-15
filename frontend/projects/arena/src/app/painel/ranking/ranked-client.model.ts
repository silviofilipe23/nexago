export type ClientBookingStatus = 'concluida' | 'no_show' | 'cancelada' | 'confirmada';

export interface ClientBookingHistoryItem {
  dateLabel: string;
  court: string;
  time: string;
  status: ClientBookingStatus;
  price: number | null;
  createdAt: Date | null;
}

export interface RankedClient {
  id: string;
  name: string;
  initials: string;
  games: number;
  spend: number;
  /** Percentual de comparecimento (check-in / (check-in + no-show)); `null` sem reserva resolvida ainda. */
  attendance: number | null;
  memberSinceLabel: string;
  history: ClientBookingHistoryItem[];
}
