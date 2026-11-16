import { BOOKING, COURTS, TIMES, type Court, type Time } from './booking-beats';

/** Passos da cena da arena, na ordem em que a quinta-feira enche. */
export type ArenaStep = 'booking' | 'fixed' | 'club' | 'tab' | 'close';

export interface ArenaBeat {
  step: ArenaStep;
  call: string;
  note: string;
  /** Situação do dia, no cabeçalho da agenda. */
  status: string;
  /** Hora no celular do gestor: os passos acontecem ao longo do dia. */
  clock: string;
}

/**
 * Da primeira reserva paga ao caixa fechado, um passo por trecho de rolagem. O último item é
 * sempre o fechamento — o componente trata o último índice como desfecho.
 */
export const ARENA_BEATS: ArenaBeat[] = [
  {
    step: 'booking',
    call: 'Reserva paga.',
    note: 'A reserva feita lá em cima caiu aqui: o atleta escolhe o horário, paga pelo app e ela entra na agenda da arena já confirmada. Role a página e veja a quinta-feira encher.',
    status: 'Reserva nova',
    clock: '17:12',
  },
  {
    step: 'fixed',
    call: 'Horário fixo.',
    note: 'Quem joga toda semana vira horário fixo: mesma quadra, mesmo dia e hora, com cobrança mensal ou por jogo. Sai do caderno, entra na agenda.',
    status: 'Mensalistas',
    clock: '17:20',
  },
  {
    step: 'club',
    call: 'Casa cheia.',
    note: 'Sobrou horário? Abra um clubinho: jogo aberto com lista pública e Pix por atleta. Aulas e torneios da casa entram na mesma agenda.',
    status: 'Lista cheia',
    clock: '17:40',
  },
  {
    step: 'tab',
    call: 'Põe na conta.',
    note: 'A comanda abre junto com a locação. Cada item lançado baixa do estoque, e a conta fecha no Pix, no cartão ou no dinheiro.',
    status: 'Bar aberto',
    clock: '18:35',
  },
  {
    step: 'close',
    call: 'Dia fechado.',
    note: 'Faturamento, ocupação e horário de pico no painel, sem planilha. O que entrou pelo app fica na carteira da arena, com saque por Pix.',
    status: 'Caixa fechado',
    clock: '22:10',
  },
];

const ORDER = ARENA_BEATS.map((beat) => beat.step);

/** A cena já chegou (ou passou) de `target`? */
export function reached(step: ArenaStep, target: ArenaStep): boolean {
  return ORDER.indexOf(step) >= ORDER.indexOf(target);
}

/**
 * A arena é a mesma da cena da reserva, no mesmo dia e com o mesmo quadro de horários: aqui ele é
 * visto do balcão. Nomes e valores são fictícios; o fluxo e os rótulos são os do painel do gestor.
 */
export const ARENA = { name: BOOKING.arena, day: BOOKING.day, hourPrice: 90 } as const;

/** O jogo aberto da quinta: duas horas de quadra, lista com vagas e Pix por atleta. */
export const CLUB = {
  name: 'Clubinho de quinta',
  court: 'Quadra 3',
  from: '18:00',
  until: '20:00',
  spots: 8,
  perAthlete: 25,
  /** A sessão da semana seguinte, que o clubinho gera sozinho, já com gente na lista. */
  next: { when: 'Quinta que vem', taken: 3 },
} as const;

/** O começo da lista de confirmados, como a tela da sessão mostra. Quem não paga o Pix acerta na arena. */
export const CLUB_PLAYERS = [
  { name: 'Bia G.', atArena: false },
  { name: 'Vini R.', atArena: false },
  { name: 'Nati S.', atArena: true },
  { name: 'Gui P.', atArena: false },
  { name: 'Lia D.', atArena: false },
] as const;

export type BlockKind = 'booking' | 'fixed' | 'club' | 'class';

/** Como cada tipo de horário aparece na agenda (os nomes são os do painel). */
export const KIND_LABEL: Record<BlockKind, string> = {
  booking: 'Reserva',
  fixed: 'Fixo',
  club: 'Clubinho',
  class: 'Aula',
};

export interface Block {
  court: Court;
  /** Hora de início. */
  time: Time;
  /** Quantos horários seguidos o bloco ocupa. */
  hours: number;
  kind: BlockKind;
  /** Quem está na quadra. */
  who: string;
  /** O esporte da reserva avulsa, como a lista de reservas mostra. */
  sport?: string;
  /** Passo em que o bloco entra na agenda. */
  since: ArenaStep;
  /** Quanto o bloco rende no dia, em reais. */
  value: number;
}

const clubRevenue = CLUB.spots * CLUB.perAthlete;

/**
 * A agenda da quinta-feira. A reserva de "Você" é a que o visitante fez na cena da reserva; todo
 * horário que lá aparecia ocupado tem dono aqui (o spec confere). A aula bloqueia a quadra e não
 * entra na conta do dia: a receita dela é a mensalidade da turma.
 */
export const AGENDA: Block[] = [
  { court: BOOKING.court, time: BOOKING.time, hours: 1, kind: 'booking', who: 'Você', sport: BOOKING.sport, since: 'booking', value: ARENA.hourPrice },
  { court: 'Quadra 3', time: '17:00', hours: 1, kind: 'booking', who: 'Rafa M.', sport: 'Vôlei de praia', since: 'booking', value: ARENA.hourPrice },
  { court: 'Quadra 2', time: '19:00', hours: 1, kind: 'booking', who: 'Carol J.', sport: 'Futevôlei', since: 'booking', value: ARENA.hourPrice },
  { court: 'Quadra 2', time: '20:00', hours: 1, kind: 'booking', who: 'Tito S.', sport: 'Beach tennis', since: 'booking', value: ARENA.hourPrice },
  { court: 'Quadra 1', time: '18:00', hours: 1, kind: 'fixed', who: 'Turma do Leo', since: 'fixed', value: ARENA.hourPrice },
  { court: 'Quadra 1', time: '20:00', hours: 1, kind: 'fixed', who: 'Malu e Ian', since: 'fixed', value: ARENA.hourPrice },
  { court: 'Quadra 3', time: '20:00', hours: 1, kind: 'fixed', who: 'Fute das 20h', since: 'fixed', value: ARENA.hourPrice },
  { court: CLUB.court, time: CLUB.from, hours: 2, kind: 'club', who: CLUB.name, since: 'club', value: clubRevenue },
  { court: 'Quadra 1', time: '17:00', hours: 1, kind: 'class', who: 'Iniciantes', since: 'club', value: 0 },
];

/** É a reserva que o visitante fez lá em cima, na cena da reserva? */
export function isYours(block: Block): boolean {
  return block.court === BOOKING.court && block.time === BOOKING.time;
}

/** Os blocos que já estão na agenda em um dado passo. */
export function blocksAt(step: ArenaStep): Block[] {
  return AGENDA.filter((block) => reached(step, block.since));
}

export interface AgendaCell {
  time: Time;
  /** Quantas colunas a casa ocupa: um bloco de duas horas vira uma casa só. */
  span: number;
  /** `null` quando o horário está livre. */
  block: Block | null;
  /** O bloco entrou na agenda neste passo? Ganha o destaque laranja. */
  fresh: boolean;
}

/** A linha de uma quadra na agenda: uma casa por horário, com os blocos longos fundidos. */
export function agendaRow(step: ArenaStep, court: Court): AgendaCell[] {
  const blocks = blocksAt(step).filter((block) => block.court === court);
  const cells: AgendaCell[] = [];
  for (let index = 0; index < TIMES.length; ) {
    const time = TIMES[index];
    const block = blocks.find((candidate) => candidate.time === time) ?? null;
    const span = block?.hours ?? 1;
    cells.push({ time, span, block, fresh: block?.since === step });
    index += span;
  }
  return cells;
}

/** Horários de quadra ocupados no passo, de todos os que a arena oferece no recorte. */
export function occupiedHours(step: ArenaStep): number {
  return blocksAt(step).reduce((total, block) => total + block.hours, 0);
}

export const TOTAL_HOURS = COURTS.length * TIMES.length;

export function occupancy(step: ArenaStep): number {
  return Math.round((occupiedHours(step) / TOTAL_HOURS) * 100);
}

export interface TabItem {
  name: string;
  quantity: number;
  /** Preço de uma unidade, em reais. */
  price: number;
}

/** A comanda que a cena abre: a do visitante, vinculada à locação dele. */
export const TAB = { who: 'Você', court: BOOKING.court, time: BOOKING.time } as const;

export const TAB_ITEMS: TabItem[] = [
  { name: 'Água', quantity: 2, price: 5 },
  { name: 'Isotônico', quantity: 1, price: 9 },
  { name: 'Açaí 300 ml', quantity: 1, price: 18 },
];

export function tabTotal(items: TabItem[] = TAB_ITEMS): number {
  return items.reduce((total, item) => total + item.quantity * item.price, 0);
}

/** As comandas do dia e o consumo de cada uma. A primeira é a da cena. */
export const TABS = [
  { who: TAB.who, where: TAB.court, total: tabTotal() },
  { who: 'Turma do Leo', where: 'Quadra 1', total: 85 },
  { who: CLUB.name, where: CLUB.court, total: 64 },
  { who: 'Mesa 4', where: 'Bar', total: 62 },
] as const;

/** O horário tem comanda aberta no nome de quem está na quadra? */
export function hasTab(block: Block): boolean {
  return TABS.some((tab) => tab.who === block.who && tab.where === block.court);
}

/** Produtos à mão no lançamento rápido da comanda: os da cena e mais um do balcão. */
export const QUICK_ITEMS = [...TAB_ITEMS.map(({ name, price }) => ({ name, price })), { name: 'Tubo de bolas', price: 35 }];

/** O que as quadras renderam até o passo. */
export function courtRevenue(step: ArenaStep): number {
  return blocksAt(step).reduce((total, block) => total + block.value, 0);
}

/** O consumo do bar só vira faturamento quando as comandas fecham, no último passo. */
export function barRevenue(step: ArenaStep): number {
  return reached(step, 'close') ? TABS.reduce((total, tab) => total + tab.total, 0) : 0;
}

export function revenue(step: ArenaStep): number {
  return courtRevenue(step) + barRevenue(step);
}

/** Reservas do dia, como o painel conta: as avulsas e as que os horários fixos geram. */
export function bookingsCount(step: ArenaStep): number {
  return blocksAt(step).filter((block) => block.kind === 'booking' || block.kind === 'fixed').length;
}

/** O horário com mais quadras ocupadas (o primeiro, em caso de empate). */
export function peakTime(step: ArenaStep): Time {
  const busyAt = (time: Time) =>
    blocksAt(step).filter((block) => {
      const start = TIMES.indexOf(block.time);
      const index = TIMES.indexOf(time);
      return index >= start && index < start + block.hours;
    }).length;
  return TIMES.reduce<Time>((peak, time) => (busyAt(time) > busyAt(peak) ? time : peak), TIMES[0]);
}

/** Faturamento dos seis dias anteriores (de sexta a quarta), para o gráfico de 7 dias do painel. */
const PREVIOUS_DAYS = [
  { day: 'sex', value: 760 },
  { day: 'sáb', value: 1240 },
  { day: 'dom', value: 1390 },
  { day: 'seg', value: 540 },
  { day: 'ter', value: 610 },
  { day: 'qua', value: 820 },
];

export interface DayBar {
  day: string;
  value: number;
  /** Altura da barra, de 0 a 100, em relação ao melhor dia. */
  height: number;
  today: boolean;
}

/** Os últimos 7 dias, com a quinta-feira da cena por último. */
export function lastSevenDays(): DayBar[] {
  const days = [...PREVIOUS_DAYS, { day: 'qui', value: revenue('close') }];
  const best = Math.max(...days.map((item) => item.value));
  return days.map((item, index) => ({ ...item, height: Math.round((item.value / best) * 100), today: index === days.length - 1 }));
}

/** Saldo da carteira da arena: acumula o que entrou pelo app nos últimos dias. */
export const WALLET_AVAILABLE = 2940;

export function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR')}`;
}

/** Com centavos, como o app mostra preço de item e saldo. */
export function formatPrice(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
