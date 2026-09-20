/**
 * Motor da rodada King of the Court: fila, trono, pontos e relógio.
 *
 * PURO de propósito — nada de Firestore aqui. A mesa registra rallies num ritmo
 * alto e erra; a correção precisa ser barata e exata. Por isso o estado nunca é
 * mutado no lugar: ele é SEMPRE derivado do log de rallies
 * ([kocReplay]). Desfazer é reproduzir sem o último, o que dispensa calcular a
 * inversa de uma coroação — que não tem inversa única.
 *
 * Regra: só o rei pontua. Quem destrona não leva ponto pela coroação, começa a
 * pontuar no rally seguinte, já no trono (`docs/business-rules/king-of-court.md`).
 */

/** Quem venceu o rally. O lado, não o time: é o que torna o replay determinístico. */
export type KocRallyWinner = "king" | "challenger";

export interface KocRally {
  /** Sequencial 1-based, na ordem de disputa. */
  seq: number;
  winner: KocRallyWinner;
}

export interface KocState {
  /** No trono. Vazio só quando a rodada não tem duplas suficientes. */
  kingTeamId: string;
  /** Do outro lado, prestes a jogar. Também é quem saca. */
  challengerTeamId: string;
  /** Fila depois do desafiante, em ordem de entrada. */
  queue: string[];
  /** Pontos por dupla — só o rei acumula. */
  points: Record<string, number>;
  /** Vezes que cada dupla assumiu o trono (inclui quem começou nele). */
  crowns: Record<string, number>;
  /** Rallies concluídos. */
  rallies: number;
  /** Ordem das coroações: último elemento é quem foi rei mais recentemente. */
  crownOrder: string[];
  /** Quem saca — sempre o desafiante que entra. */
  servingTeamId: string;
}

export class KocEngineError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = "KocEngineError";
  }
}

/** Mínimo para a fila girar: rei, desafiante e alguém esperando. */
export const KOC_MIN_ROSTER = 3;

/**
 * Estado no apito inicial: o primeiro do elenco no trono, o segundo desafiando,
 * o resto na fila. A ordem do elenco é a semeadura, então o cabeça de chave
 * começa no trono — e começa a ter de defendê-lo.
 */
export function kocInitialState(teamIds: readonly string[]): KocState {
  const roster = teamIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (roster.length < KOC_MIN_ROSTER) {
    throw new KocEngineError(
      `Rodada King of the Court precisa de ao menos ${KOC_MIN_ROSTER} duplas ` +
        `(há ${roster.length}).`,
      "koc_roster_too_small",
    );
  }
  const [king, challenger, ...queue] = roster;
  return {
    kingTeamId: king!,
    challengerTeamId: challenger!,
    queue,
    points: Object.fromEntries(roster.map((id) => [id, 0])),
    crowns: Object.fromEntries(roster.map((id) => [id, id === king ? 1 : 0])),
    rallies: 0,
    crownOrder: [king!],
    servingTeamId: challenger!,
  };
}

/**
 * Um rally.
 *
 * Rei vence → +1 e fica; o desafiante vai para o fim da fila.
 * Desafiante vence → assume o trono SEM pontuar; o rei destronado vai para o fim.
 * Nos dois casos entra o próximo da fila e ele passa a sacar.
 */
export function kocApplyRally(state: KocState, winner: KocRallyWinner): KocState {
  const {kingTeamId, challengerTeamId, queue} = state;
  const points = {...state.points};
  const crowns = {...state.crowns};
  const crownOrder = [...state.crownOrder];

  let nextKing: string;
  let leaving: string;
  if (winner === "king") {
    points[kingTeamId] = (points[kingTeamId] ?? 0) + 1;
    nextKing = kingTeamId;
    leaving = challengerTeamId;
  } else {
    // Coroação não pontua: o desafiante só começa a somar defendendo.
    nextKing = challengerTeamId;
    leaving = kingTeamId;
    crowns[challengerTeamId] = (crowns[challengerTeamId] ?? 0) + 1;
    crownOrder.push(challengerTeamId);
  }

  const nextQueue = [...queue, leaving];
  const nextChallenger = nextQueue.shift() ?? "";

  return {
    kingTeamId: nextKing,
    challengerTeamId: nextChallenger,
    queue: nextQueue,
    points,
    crowns,
    rallies: state.rallies + 1,
    crownOrder,
    servingTeamId: nextChallenger,
  };
}

/**
 * Estado a partir do elenco e do log.
 *
 * É a única forma de obter estado: o doc da rodada guarda o resultado, mas a
 * verdade é o log. Desfazer = reproduzir com um rally a menos.
 */
export function kocReplay(
  teamIds: readonly string[],
  rallies: readonly KocRally[],
): KocState {
  const ordered = [...rallies].sort((a, b) => a.seq - b.seq);
  let state = kocInitialState(teamIds);
  for (const rally of ordered) {
    state = kocApplyRally(state, rally.winner);
  }
  return state;
}

// ─── Relógio ────────────────────────────────────────────────────────────────

export interface KocClock {
  startedAtMs: number;
  durationSec: number;
  /** Segundos já passados em pausa, fechados. */
  pausedAccumSec: number;
  /** Quando a pausa atual começou; nulo se está correndo. */
  pausedAtMs: number | null;
}

export function kocClockStart(nowMs: number, durationSec: number): KocClock {
  return {
    startedAtMs: nowMs,
    durationSec,
    pausedAccumSec: 0,
    pausedAtMs: null,
  };
}

/**
 * Quando a rodada termina, em epoch ms.
 *
 * O cliente NUNCA calcula prazo: recebe este valor e só renderiza a contagem.
 * É o que mantém mesa, telão e app olhando o mesmo relógio.
 */
export function kocClockEndsAtMs(clock: KocClock): number {
  return clock.startedAtMs + (clock.durationSec + clock.pausedAccumSec) * 1000;
}

export function kocClockRemainingSec(clock: KocClock, nowMs: number): number {
  // Em pausa o tempo congela onde parou.
  const reference = clock.pausedAtMs ?? nowMs;
  const remaining = Math.ceil((kocClockEndsAtMs(clock) - reference) / 1000);
  return Math.max(0, remaining);
}

export function kocClockIsExpired(clock: KocClock, nowMs: number): boolean {
  return kocClockRemainingSec(clock, nowMs) === 0;
}

export function kocClockPause(clock: KocClock, nowMs: number): KocClock {
  if (clock.pausedAtMs != null) return clock;
  return {...clock, pausedAtMs: nowMs};
}

export function kocClockResume(clock: KocClock, nowMs: number): KocClock {
  if (clock.pausedAtMs == null) return clock;
  const pausedSec = Math.max(0, Math.round((nowMs - clock.pausedAtMs) / 1000));
  return {
    ...clock,
    pausedAccumSec: clock.pausedAccumSec + pausedSec,
    pausedAtMs: null,
  };
}

/**
 * Nova duração para a rodada — o ajuste da mesa.
 *
 * Com uma quadra e rodadas em sequência, encurtar uma rodada é o único jeito de
 * recuperar horário depois de um estouro sem cortar rodada do chaveamento
 * (seção 8 do plano).
 */
export function kocClockSetDuration(
  clock: KocClock,
  durationSec: number,
  bounds: {minSec: number; maxSec: number},
): KocClock {
  const clamped = Math.min(
    bounds.maxSec,
    Math.max(bounds.minSec, Math.round(durationSec)),
  );
  return {...clock, durationSec: clamped};
}

// ─── Classificação ──────────────────────────────────────────────────────────

export interface KocStanding {
  teamId: string;
  place: number;
  points: number;
  crowns: number;
  /** Pontos das duplas empatadas com esta — vazio quando não há empate. */
  tiedOnPointsWith: string[];
}

/**
 * Classificação da rodada.
 *
 * Critérios automáticos, na ordem: pontos → quem foi rei mais recentemente →
 * ordem de entrada (semeadura), que é o desempate determinístico final.
 *
 * A **bola de ouro** do regulamento não cabe aqui: ela é um rally jogado na
 * quadra, não uma conta. Por isso cada colocação carrega [tiedOnPointsWith] —
 * é o que permite a mesa ver que o empate existe e decidir na areia. Sem isso a
 * ordem sairia de um critério silencioso.
 */
export function kocStandings(
  teamIds: readonly string[],
  state: KocState,
): KocStanding[] {
  const roster = teamIds.map((id) => id.trim()).filter((id) => id.length > 0);
  const seedIndex = new Map(roster.map((id, i) => [id, i]));
  // Rei mais recente primeiro: posição a partir do FIM de `crownOrder`.
  const lastCrownIndex = new Map<string, number>();
  state.crownOrder.forEach((id, i) => lastCrownIndex.set(id, i));

  const pointsOf = (id: string): number => state.points[id] ?? 0;

  const sorted = [...roster].sort((a, b) => {
    const byPoints = pointsOf(b) - pointsOf(a);
    if (byPoints !== 0) return byPoints;
    const crownA = lastCrownIndex.get(a) ?? -1;
    const crownB = lastCrownIndex.get(b) ?? -1;
    if (crownA !== crownB) return crownB - crownA;
    return (seedIndex.get(a) ?? 0) - (seedIndex.get(b) ?? 0);
  });

  const byPoints = new Map<number, string[]>();
  for (const id of roster) {
    const list = byPoints.get(pointsOf(id)) ?? [];
    list.push(id);
    byPoints.set(pointsOf(id), list);
  }

  return sorted.map((teamId, index) => ({
    teamId,
    place: index + 1,
    points: pointsOf(teamId),
    crowns: state.crowns[teamId] ?? 0,
    tiedOnPointsWith: (byPoints.get(pointsOf(teamId)) ?? []).filter(
      (id) => id !== teamId,
    ),
  }));
}

/** Empate que decide classificação — onde a bola de ouro é devida. */
export function kocQualifyingTies(
  standings: readonly KocStanding[],
  qualifiersPerRound: number,
): string[][] {
  const cut = Math.max(1, Math.floor(qualifiersPerRound));
  if (cut >= standings.length) return [];

  // O empate só importa se atravessa o corte: empate por 1º entre dois que já
  // passam não muda quem classifica.
  const lastIn = standings[cut - 1];
  const firstOut = standings[cut];
  if (!lastIn || !firstOut) return [];
  if (lastIn.points !== firstOut.points) return [];

  const tied = standings
    .filter((s) => s.points === lastIn.points)
    .map((s) => s.teamId);
  return tied.length > 1 ? [tied] : [];
}
