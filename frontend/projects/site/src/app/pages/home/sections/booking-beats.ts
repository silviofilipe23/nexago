/** Etapas da reserva, na ordem em que acontecem no app. */
export type BookingStep = 'search' | 'sport' | 'slot' | 'pay' | 'done';

export interface BookingBeat {
  step: BookingStep;
  call: string;
  note: string;
}

/** A reserva que a cena conta. Arena e valores são fictícios; o fluxo é o do app. */
export const BOOKING = {
  arena: 'Arena Maré',
  day: 'Hoje, quinta',
  dayShort: 'qui, hoje',
  sport: 'Beach tennis',
  court: 'Quadra 2',
  time: '18:00',
  until: '19:00',
  price: 'R$ 90,00',
  pricePerHour: 'R$ 90',
  distance: '2,3 km',
  rating: '4,8',
} as const;

/**
 * Do "bora jogar?" ao "reservado", um passo por trecho de rolagem. O último item é sempre a
 * reserva confirmada — o componente trata o último índice como desfecho.
 */
export const BOOKING_BEATS: BookingBeat[] = [
  {
    step: 'search',
    call: 'Bora jogar hoje?',
    note: 'Quinta-feira, saindo do trabalho. Role a página e garanta a quadra.',
  },
  {
    step: 'sport',
    call: 'Escolhe o esporte.',
    note: 'Beach tennis. O app mostra as arenas perto de você com quadra para esse esporte, e quanto custa a hora.',
  },
  {
    step: 'slot',
    call: 'Às 18h tem vaga.',
    note: 'Arena Maré, Quadra 2, das 18h às 19h. O que aparece livre aqui é a agenda de verdade da arena.',
  },
  {
    step: 'pay',
    call: 'Pix e pronto.',
    note: 'Confirma, paga pelo app e a confirmação cai na hora. Sem ligar para ninguém, sem esperar resposta no grupo.',
  },
  {
    step: 'done',
    call: 'Reservado.',
    note: 'A quadra é sua. A reserva já está na agenda e dá para chamar a galera dali mesmo.',
  },
];

export const TIMES = ['17:00', '18:00', '19:00', '20:00'] as const;
export const COURTS = ['Quadra 1', 'Quadra 2', 'Quadra 3'] as const;

export type Time = (typeof TIMES)[number];
export type Court = (typeof COURTS)[number];

/** Agenda da arena antes da reserva: os horários já ocupados de cada quadra. */
const TAKEN: Record<Court, readonly Time[]> = {
  'Quadra 1': ['17:00', '18:00', '20:00'],
  'Quadra 2': ['19:00'],
  'Quadra 3': ['17:00', '20:00'],
};

/**
 * O que cada casa do quadro de horários mostra:
 * - `unknown`: ainda não se escolheu o esporte, então não há agenda para mostrar;
 * - `busy` / `free`: a agenda da arena;
 * - `picked` → `holding` → `yours`: a casa escolhida, do toque ao pagamento confirmado.
 */
export type CellState = 'unknown' | 'busy' | 'free' | 'picked' | 'holding' | 'yours';

const CHOSEN_BY_STEP: Record<BookingStep, CellState> = {
  search: 'unknown',
  sport: 'free',
  slot: 'picked',
  pay: 'holding',
  done: 'yours',
};

export function isChosen(court: Court, time: Time): boolean {
  return court === BOOKING.court && time === BOOKING.time;
}

export function cellState(step: BookingStep, court: Court, time: Time): CellState {
  if (step === 'search') return 'unknown';
  if (TAKEN[court].includes(time)) return 'busy';
  return isChosen(court, time) ? CHOSEN_BY_STEP[step] : 'free';
}

/** Horários ainda livres de uma quadra — a mesma agenda do quadro, para a tela do app. */
export function freeTimes(court: Court): Time[] {
  return TIMES.filter((time) => !TAKEN[court].includes(time));
}

/** A etapa já chegou (ou passou) de `target`? Para mostrar o que só existe dali em diante. */
export function reached(step: BookingStep, target: BookingStep): boolean {
  const order = BOOKING_BEATS.map((beat) => beat.step);
  return order.indexOf(step) >= order.indexOf(target);
}
