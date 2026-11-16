/** Passos da cena do organizador, na ordem em que um torneio acontece. */
export type OrganizerStep = 'signup' | 'draw' | 'schedule' | 'live' | 'podium';

export interface OrganizerBeat {
  step: OrganizerStep;
  call: string;
  note: string;
  /** Situação do torneio, como o painel mostra. */
  status: string;
  /** Hora no celular: os passos acontecem em dias e horas diferentes. */
  clock: string;
}

/**
 * Das inscrições ao pódio, um passo por trecho de rolagem. O último item é sempre o torneio
 * encerrado — o componente trata o último índice como desfecho.
 */
export const ORGANIZER_BEATS: OrganizerBeat[] = [
  {
    step: 'signup',
    call: 'Inscrições abertas.',
    note: 'Você compartilha o link, a dupla se inscreve e paga pelo app. Cada inscrição aparece no painel na hora, já com o pagamento conferido.',
    status: 'Inscrições abertas',
    clock: '20:14',
  },
  {
    step: 'draw',
    call: 'Chave sorteada.',
    note: 'Fechou a categoria, um botão gera a chave: cabeças distribuídas, prévia antes de publicar e sorteio de novo se você quiser.',
    status: 'Chave publicada',
    clock: '21:02',
  },
  {
    step: 'schedule',
    call: 'Dia montado.',
    note: 'O auto-agendamento distribui os jogos pelas quadras e horários, sem conflito de atleta e respeitando a ordem da chave. Você confere a prévia e aplica.',
    status: 'Jogos agendados',
    clock: '21:10',
  },
  {
    step: 'live',
    call: 'Mesa no ar.',
    note: 'O mesário lança ponto a ponto no celular. A torcida vê o placar ao vivo, a arena vê no telão e a chave avança sozinha a cada jogo.',
    status: 'Ao vivo',
    clock: '10:52',
  },
  {
    step: 'podium',
    call: 'Campeões.',
    note: 'Pódio fechado, ranking atualizado e o caixa do evento no Financeiro: o que entrou pelo app vai para a sua carteira, com saque por Pix.',
    status: 'Encerrado',
    clock: '12:20',
  },
];

const ORDER = ORGANIZER_BEATS.map((beat) => beat.step);

/** A cena já chegou (ou passou) de `target`? */
export function reached(step: OrganizerStep, target: OrganizerStep): boolean {
  return ORDER.indexOf(step) >= ORDER.indexOf(target);
}

/** O torneio da cena. Nomes e valores são fictícios; o fluxo e os rótulos são os do painel. */
export const EVENT = { name: 'Open de Verão', category: 'Misto B', fee: 160 } as const;

/** Duplas inscritas, na ordem das cabeças de chave: a primeira é a cabeça 1. */
export const TEAMS = [
  'Duda e Leo',
  'Caio e Mel',
  'Rafa e Tito',
  'Carol e Juca',
  'Malu e Ian',
  'Lia e Dani',
  'Nati e Vini',
  'Bia e Gui',
] as const;

export function collected(teams: number = TEAMS.length, fee: number = EVENT.fee): number {
  return teams * fee;
}

export type MatchId = 'q1' | 'q2' | 'q3' | 'q4' | 's1' | 's2' | 'f';
type Side = 'home' | 'away';

/** Quem ocupa um lado da partida: uma cabeça de chave ou quem vencer a partida anterior. */
type Slot = { seed: number } | { winnerOf: MatchId };

interface PlannedMatch {
  id: MatchId;
  label: string;
  home: Slot;
  away: Slot;
  time: string;
  court: 1 | 2;
  /** Sets ganhos por cada lado no placar final. */
  sets: [number, number];
}

/**
 * A chave inteira de uma eliminatória simples de 8, com o cruzamento padrão (1×8, 4×5, 3×6, 2×7:
 * as cabeças 1 e 2 só se encontram na final), a grade de duas quadras e os placares finais.
 */
const MATCHES: Record<MatchId, PlannedMatch> = {
  q1: { id: 'q1', label: 'Quartas 1', home: { seed: 1 }, away: { seed: 8 }, time: '09:00', court: 1, sets: [2, 0] },
  q2: { id: 'q2', label: 'Quartas 2', home: { seed: 4 }, away: { seed: 5 }, time: '09:00', court: 2, sets: [2, 1] },
  q3: { id: 'q3', label: 'Quartas 3', home: { seed: 3 }, away: { seed: 6 }, time: '09:40', court: 1, sets: [2, 0] },
  q4: { id: 'q4', label: 'Quartas 4', home: { seed: 2 }, away: { seed: 7 }, time: '09:40', court: 2, sets: [2, 0] },
  s1: { id: 's1', label: 'Semi 1', home: { winnerOf: 'q1' }, away: { winnerOf: 'q2' }, time: '10:40', court: 1, sets: [2, 0] },
  s2: { id: 's2', label: 'Semi 2', home: { winnerOf: 'q3' }, away: { winnerOf: 'q4' }, time: '10:40', court: 2, sets: [1, 2] },
  f: { id: 'f', label: 'Final', home: { winnerOf: 's1' }, away: { winnerOf: 's2' }, time: '11:40', court: 1, sets: [2, 1] },
};

export const MATCH_IDS = Object.keys(MATCHES) as MatchId[];

/** As fases, cada uma em pares de partidas que se encontram na fase seguinte. */
export const ROUNDS: { title: string; pairs: MatchId[][] }[] = [
  { title: 'Quartas', pairs: [['q1', 'q2'], ['q3', 'q4']] },
  { title: 'Semifinal', pairs: [['s1', 's2']] },
  { title: 'Final', pairs: [['f']] },
];

/** Em que passo cada partida já terminou. No passo "ao vivo" a segunda semifinal está em quadra. */
const DONE_AT: Record<MatchId, OrganizerStep> = {
  q1: 'live',
  q2: 'live',
  q3: 'live',
  q4: 'live',
  s1: 'live',
  s2: 'podium',
  f: 'podium',
};

/** A partida que a mesa está lançando no passo "ao vivo": 1º set fechado, 2º em andamento. */
export const LIVE = { id: 's2' as MatchId, sets: [0, 1] as [number, number], firstSet: '18–21', points: [14, 16] as [number, number] };

function winningSide(id: MatchId): Side {
  const [home, away] = MATCHES[id].sets;
  return home > away ? 'home' : 'away';
}

/** A dupla que ocupa um lado, sem olhar o passo: resolve "vencedor de" até chegar numa cabeça. */
function teamOf(slot: Slot): string {
  return 'seed' in slot ? TEAMS[slot.seed - 1] : winnerOf(slot.winnerOf);
}

export function winnerOf(id: MatchId): string {
  return teamOf(MATCHES[id][winningSide(id)]);
}

export function loserOf(id: MatchId): string {
  return teamOf(MATCHES[id][winningSide(id) === 'home' ? 'away' : 'home']);
}

export const CHAMPIONS = winnerOf('f');
export const RUNNERS_UP = loserOf('f');

export type MatchState = 'open' | 'scheduled' | 'live' | 'done';

export interface SideView {
  /** `null` enquanto a partida anterior não acabou ("A definir"). */
  name: string | null;
  sets: number | null;
  won: boolean;
}

export interface MatchView {
  id: MatchId;
  label: string;
  time: string;
  court: number;
  /** A partida já tem hora e quadra neste passo? */
  scheduled: boolean;
  state: MatchState;
  home: SideView;
  away: SideView;
}

/** Como uma partida aparece na chave em um dado passo. Antes do sorteio a chave não existe. */
export function matchView(step: OrganizerStep, id: MatchId): MatchView {
  const match = MATCHES[id];
  const done = reached(step, DONE_AT[id]);
  const live = !done && step === 'live' && id === LIVE.id;
  const scheduled = reached(step, 'schedule');
  const sets = done ? match.sets : live ? LIVE.sets : null;
  const winner = done ? winningSide(id) : null;

  const side = (which: Side, index: 0 | 1): SideView => {
    const slot = match[which];
    const known = 'seed' in slot || reached(step, DONE_AT[slot.winnerOf]);
    return { name: known ? teamOf(slot) : null, sets: sets ? sets[index] : null, won: winner === which };
  };

  return {
    id,
    label: match.label,
    time: match.time,
    court: match.court,
    scheduled,
    state: done ? 'done' : live ? 'live' : scheduled ? 'scheduled' : 'open',
    home: side('home', 0),
    away: side('away', 1),
  };
}

export interface GridRow {
  time: string;
  /** Uma casa por quadra; `null` quando a quadra está livre naquele horário. */
  courts: (string | null)[];
}

export const COURTS = [1, 2] as const;

/** A grade de quadras × horários do dia, como a tela de agendamento mostra. */
export function scheduleGrid(): GridRow[] {
  const times = [...new Set(MATCH_IDS.map((id) => MATCHES[id].time))].sort();
  return times.map((time) => ({
    time,
    courts: COURTS.map((court) => {
      const id = MATCH_IDS.find((candidate) => MATCHES[candidate].time === time && MATCHES[candidate].court === court);
      return id ? MATCHES[id].label : null;
    }),
  }));
}

export function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR')}`;
}
