/** Espelha `athlete_agenda_page.dart` — só o lado de aluguel de quadra (`arenaBookings`) nesta
 *  rodada. Torneio na agenda real é a nível de inscrição/evento (não de partida individual —
 *  não lê a coleção `matches`), e "desafio" (Bora Jogar) é um card que o próprio app mobile já
 *  deixa vazio (`challenges: const []` em `athlete_agenda_logic.dart`) — nenhum dos dois entra
 *  aqui ainda; ver memória da sessão pra retomar. */

export type AgendaStatusTone = 'live' | 'confirmed' | 'warning' | 'neutral';

export interface AgendaEvent {
  id: string;
  startsAt: Date;
  durationMin: number;
  title: string;
  subtitle: string;
  location: string;
  statusLabel: string;
  statusTone: AgendaStatusTone;
}

export interface AgendaDayGroup {
  key: string;
  label: string;
  events: AgendaEvent[];
}

export interface AgendaWeekDay {
  key: string;
  weekdayShort: string;
  dayNum: number;
  isToday: boolean;
  dotCount: 0 | 1 | 2 | 3;
}

export interface AgendaMonthStat {
  label: string;
  value: string;
}
