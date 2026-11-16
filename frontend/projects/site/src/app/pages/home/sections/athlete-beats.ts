/** Passos da cena do atleta, na ordem em que a ficha se preenche. */
export type AthleteStep = 'focus' | 'history' | 'level' | 'ranking' | 'xp' | 'share';

export interface AthleteBeat {
  step: AthleteStep;
  call: string;
  note: string;
}

/**
 * Do dia de torneio ao card no story, um passo por trecho de rolagem. O último item é sempre o
 * compartilhamento — o componente trata o último índice como desfecho.
 */
export const ATHLETE_BEATS: AthleteBeat[] = [
  {
    step: 'focus',
    call: 'Dia de torneio.',
    note: 'O app entra sozinho no Modo Focus: sua próxima partida, a quadra e a hora. Role a página e veja o que fica com você depois do jogo.',
  },
  {
    step: 'history',
    call: 'Tudo registrado.',
    note: 'Torneio ou pelada, cada partida entra no seu histórico com placar, ponto a ponto e o retrospecto contra cada adversário.',
  },
  {
    step: 'level',
    call: 'Subiu de nível.',
    note: 'No vôlei, cada partida de torneio mexe nos seus pontos de nível. Passou da marca, você sobe, sem precisar pedir para ninguém.',
  },
  {
    step: 'ranking',
    call: 'Top 10.',
    note: 'Resultado de torneio vira ponto no ranking do seu esporte. Filtre por gênero, nível e formato e veja quantas posições você subiu.',
  },
  {
    step: 'xp',
    call: 'Jogar rende.',
    note: 'Reserva jogada, vitória em torneio, missão do dia: tudo dá XP. E as conquistas vão ficando no seu perfil.',
  },
  {
    step: 'share',
    call: 'Posta aí.',
    note: 'Sua posição no ranking, sua campanha e o resultado do jogo viram card pronto para o story.',
  },
];

const ORDER = ATHLETE_BEATS.map((beat) => beat.step);

/** A cena já chegou (ou passou) de `target`? */
export function reached(step: AthleteStep, target: AthleteStep): boolean {
  return ORDER.indexOf(step) >= ORDER.indexOf(target);
}

/** As quatro casas da ficha; cada uma acende no passo de mesmo nome e continua acesa. */
export const STATS = ['history', 'level', 'ranking', 'xp'] as const;
export type Stat = (typeof STATS)[number];

export type Result = 'win' | 'loss';

export interface PlayedMatch {
  round: string;
  event: string;
  kind: 'Torneio' | 'Pelada';
  result: Result;
  score: string;
}

/**
 * O atleta da cena é o mesmo "Você" que venceu a semifinal na cena do placar (por isso a final de
 * domingo e o 2 a 0 no topo do histórico). Nomes e números são fictícios; rótulos e regras (como
 * os +50 XP por vitória em torneio) são os do app.
 */
export const ATHLETE = {
  name: 'Você',
  sport: 'Vôlei de praia',
  tournament: 'Open de Verão',
  next: { round: 'Final', when: 'Hoje, 10:30', court: 'Quadra 1', startsIn: '18 min', teams: 'Você e Duda × Caio e Mel' },
  games: 47,
  wins: 31,
  longestStreak: 6,
  level: { name: 'Intermediário 2', next: 'Avançado 1', points: 1540, dropAt: 1400, startAt: 1450, promoteAt: 1600 },
  xp: { total: 2340, streakDays: 6, achievements: 12 },
} as const;

/** Partidas mais recentes primeiro. A tela do app lista as primeiras; a ficha resume as cinco. */
export const RECENT_MATCHES: PlayedMatch[] = [
  { round: 'Semifinal', event: 'Open de Verão', kind: 'Torneio', result: 'win', score: '2–0' },
  { round: 'Quartas', event: 'Open de Verão', kind: 'Torneio', result: 'win', score: '2–1' },
  { round: 'Pelada de quinta', event: 'Arena Maré', kind: 'Pelada', result: 'win', score: '3–1' },
  { round: 'Final', event: 'Copa Maré', kind: 'Torneio', result: 'loss', score: '1–2' },
  { round: 'Semifinal', event: 'Copa Maré', kind: 'Torneio', result: 'win', score: '2–0' },
];

/** Os últimos resultados, do mais antigo ao mais recente, como se lê uma sequência. */
export function recentForm(matches: PlayedMatch[] = RECENT_MATCHES): Result[] {
  return matches.map((match) => match.result).reverse();
}

export function winRate(wins: number, games: number): number {
  return games === 0 ? 0 : Math.round((wins / games) * 100);
}

export function pointsToPromotion(level: { points: number; promoteAt: number }): number {
  return Math.max(0, level.promoteAt - level.points);
}

/** Quanto da faixa do nível já foi percorrido, de 0 a 100, para a barra de progresso. */
export function levelProgress(level: { points: number; startAt: number; promoteAt: number }): number {
  const done = (level.points - level.startAt) / (level.promoteAt - level.startAt);
  return Math.round(Math.min(1, Math.max(0, done)) * 100);
}

export interface RankingRow {
  name: string;
  points: number;
  you?: true;
}

/** Recorte do ranking em volta do atleta. `RANKING_FROM` é a posição da primeira linha. */
export const RANKING_FROM = 7;
export const RANKING: RankingRow[] = [
  { name: 'Bruna M.', points: 3410 },
  { name: 'Léo F.', points: 3180 },
  { name: 'Você', points: 2930, you: true },
  { name: 'Nati S.', points: 2870 },
  { name: 'Caio P.', points: 2640 },
];

/** Posições que o atleta subiu com a última etapa (o "subiu N" do ranking do app). */
export const RANKING_CLIMB = 3;

export function myPosition(rows: RankingRow[] = RANKING, from = RANKING_FROM): number {
  return from + rows.findIndex((row) => row.you);
}

export interface Mission {
  title: string;
  xp: number;
  done: boolean;
}

export const MISSIONS_PER_DAY = 5;
export const MISSIONS: Mission[] = [
  { title: 'Reserve uma quadra hoje', xp: 35, done: true },
  { title: 'Vença uma partida', xp: 40, done: true },
  { title: 'Avalie a arena', xp: 15, done: false },
];

/** XP por vitória em torneio — valor real do app. */
export const TOURNAMENT_WIN_XP = 50;

export function formatThousands(value: number): string {
  return value.toLocaleString('pt-BR');
}
