/**
 * Live Activity "minha próxima partida" (Modo Focus) — o núcleo puro.
 *
 * O estado do card é montado SÓ aqui, no servidor: a callable que o app chama
 * ao abrir o Focus devolve este estado para a activity nascer, e o gatilho das
 * partidas manda o mesmo estado nas atualizações. Um construtor só — se o app
 * montasse o estado inicial em Dart, o texto do card mudaria no primeiro push.
 *
 * `NextMatchContentState` é o contrato com o `struct ContentState` do Swift
 * (`ios/NexagoLiveActivities/NextMatchAttributes.swift`). Renomear um campo de
 * um lado faz o card parar de atualizar sem erro em lugar nenhum; o teste
 * "CONTRATO" fixa o JSON inteiro.
 *
 * As regras de "partida do dia" e de prioridade são as do app
 * (`matchBelongsToDay`, `athleteMatchPriority`/`pickAthleteNextMatch`): o que o
 * card diz e o que o Focus mostra não podem discordar.
 */

import {TokenMessage} from "firebase-admin/messaging";
import {dayKeyFromEventDate, eventTimeLabel} from "./event-timezone";
import {snapshotFromMatchData} from "./match-live-follow-notify";
import {
  isMatchCanceled,
  isMatchCompleted,
  isMatchInProgress,
  normalizeMatchStatusKey,
  normalizeMatchType,
} from "./match-status";

export const NEXT_MATCH_ACTIVITIES_COLLECTION = "nextMatchActivities";

/** Itens da linha do dia no card (o resto não cabe na largura do iPhone). */
export const NEXT_MATCH_MAX_DAY_ITEMS = 5;

/** Quanto o card de "fim do dia" fica na tela depois de encerrado. */
export const NEXT_MATCH_DAY_OVER_DISMISS_MS = 30 * 60 * 1000;

const ON_COURT = "on_court";
const WAITING = "waiting";

/** A partida reduzida ao que o card usa. */
export interface NextMatchLite {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamAId: string;
  teamBId: string;
  teamADescription: string | null;
  teamBDescription: string | null;
  status: string;
  winnerId: string | null;
  scheduleTime: Date | null;
  matchStartedAt: Date | null;
  matchEndedAt: Date | null;
  dayKey: string;
  queueStatus: string;
  queueOrder: number;
  courtName: string;
  matchType: string;
  isGroupMatch: boolean;
  poolId: string;
  round: number;
  matchNumber: number;
  /** Sets vencidos por cada lado (todos os sets gravados). */
  setsWonA: number;
  setsWonB: number;
  /** Jogo da chave para onde vai o vencedor / o perdedor (`matchNumber`). */
  winnerAdvanceMatchNumber: number | null;
  loserAdvanceMatchNumber: number | null;
}

/**
 * - `scheduled`: próximo jogo marcado (ou na fila);
 * - `called`: a mesa chamou a dupla para a quadra;
 * - `playing`: a partida começou (no 2º PR o card vira o placar);
 * - `waiting`: acabaram as partidas do atleta, mas a chave da categoria ainda
 *   tem vaga em aberto no dia (ele pode ser o classificado);
 * - `dayOver`: nada mais no dia — o push encerra a activity.
 */
export type NextMatchPhase = "scheduled" | "called" | "playing" | "waiting" | "dayOver";

export type NextMatchDayKind = "win" | "loss" | "done" | "next" | "upcoming";

export interface NextMatchDayItem {
  kind: NextMatchDayKind;
  label: string;
}

/** CONTRATO com o Swift — a ordem das chaves é a ordem de atribuição. */
export interface NextMatchContentState {
  phase: NextMatchPhase;
  matchId: string | null;
  courtLabel: string | null;
  courtShort: string | null;
  opponent: string;
  phaseLabel: string;
  scheduleTimeMs: number | null;
  day: NextMatchDayItem[];
  summary: string | null;
}

export interface BuildNextMatchStateInput {
  /** Partidas das duplas do atleta (pode vir com outras, são filtradas). */
  matches: NextMatchLite[];
  /**
   * Partidas das categorias do atleta: dão o nome da fase e dizem se a chave
   * ainda tem vaga que pode ser dele.
   */
  categoryMatches: NextMatchLite[];
  teamIds: ReadonlySet<string>;
  dayKey: string;
  /** Nome de cada dupla adversária, por id de time. */
  teamNames: ReadonlyMap<string, string>;
}

// --- Leitura do doc -----------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const raw = value as {toDate?: () => Date} | null | undefined;
  if (raw && typeof raw.toDate === "function") {
    const d = raw.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function nextMatchLiteFromData(
  id: string,
  data: Record<string, unknown>,
): NextMatchLite {
  let setsWonA = 0;
  let setsWonB = 0;
  for (const set of snapshotFromMatchData(data).sets) {
    if (set.a > set.b) setsWonA++;
    else if (set.b > set.a) setsWonB++;
  }
  return {
    id,
    tournamentId: str(data.tournamentId),
    categoryId: str(data.categoryId),
    teamAId: str(data.teamAId),
    teamBId: str(data.teamBId),
    teamADescription: str(data.teamADescription) || null,
    teamBDescription: str(data.teamBDescription) || null,
    status: str(data.status),
    winnerId: str(data.winnerId) || null,
    scheduleTime: dateOf(data.scheduleTime),
    matchStartedAt: dateOf(data.matchStartedAt),
    matchEndedAt: dateOf(data.matchEndedAt),
    dayKey: str(data.dayKey),
    queueStatus: str(data.queueStatus),
    queueOrder: int(data.queueOrder),
    courtName: str(data.courtName),
    matchType: str(data.matchType),
    isGroupMatch: data.isGroupMatch === true,
    poolId: str(data.poolId),
    round: int(data.round),
    matchNumber: int(data.matchNumber),
    setsWonA,
    setsWonB,
    winnerAdvanceMatchNumber: intOrNull(data.winnerAdvanceMatchNumber),
    loserAdvanceMatchNumber: intOrNull(data.loserAdvanceMatchNumber),
  };
}

// --- Dia e prioridade (espelho do app) ------------------------------------------

/**
 * A partida é do dia [dayKey]? Mesma regra de `matchBelongsToDay` no app: vale
 * horário, início, fim ou `dayKey`; sem nenhuma âncora, conta se ainda está
 * aberta (a fila do dia não tem horário).
 */
export function matchOnEventDay(m: NextMatchLite, dayKey: string): boolean {
  const anchors = [m.scheduleTime, m.matchStartedAt, m.matchEndedAt];
  for (const anchor of anchors) {
    if (anchor && dayKeyFromEventDate(anchor) === dayKey) return true;
  }
  if (m.dayKey && m.dayKey === dayKey) return true;
  if (anchors.some((a) => a !== null) || m.dayKey) return false;
  return !isMatchCompleted(m.status) && !isMatchCanceled(m.status);
}

function isMine(m: NextMatchLite, teamIds: ReadonlySet<string>): boolean {
  return teamIds.has(m.teamAId) || teamIds.has(m.teamBId);
}

/** Chamada de quadra > ao vivo > agendada > fila (`athleteMatchPriority`). */
function priorityOf(m: NextMatchLite): number {
  if (m.queueStatus === ON_COURT) return 0;
  if (isMatchInProgress(m.status)) return 1;
  if (m.scheduleTime) return 2;
  if (m.queueStatus === WAITING) return 3;
  return 4;
}

function byTimeThenQueue(a: NextMatchLite, b: NextMatchLite): number {
  const ta = a.scheduleTime?.getTime();
  const tb = b.scheduleTime?.getTime();
  if (ta !== undefined && tb !== undefined) return ta - tb;
  if (ta !== undefined) return -1;
  if (tb !== undefined) return 1;
  return a.queueOrder - b.queueOrder || a.matchNumber - b.matchNumber;
}

export function pickNextMatch(
  matches: NextMatchLite[],
  teamIds: ReadonlySet<string>,
  dayKey: string,
): NextMatchLite | null {
  const open = matches.filter(
    (m) =>
      isMine(m, teamIds) &&
      !isMatchCompleted(m.status) &&
      !isMatchCanceled(m.status) &&
      matchOnEventDay(m, dayKey),
  );
  open.sort((a, b) => priorityOf(a) - priorityOf(b) || byTimeThenQueue(a, b));
  return open[0] ?? null;
}

/** As partidas do atleta no dia, em ordem de relógio (sem horário no fim). */
function dayMatchesOf(
  matches: NextMatchLite[],
  teamIds: ReadonlySet<string>,
  dayKey: string,
): NextMatchLite[] {
  const seen = new Set<string>();
  return matches
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return isMine(m, teamIds) && !isMatchCanceled(m.status) && matchOnEventDay(m, dayKey);
    })
    .sort((a, b) => {
      const ta = (a.scheduleTime ?? a.matchStartedAt)?.getTime();
      const tb = (b.scheduleTime ?? b.matchStartedAt)?.getTime();
      if (ta !== undefined && tb !== undefined) return ta - tb;
      if (ta !== undefined) return -1;
      if (tb !== undefined) return 1;
      return a.matchNumber - b.matchNumber;
    });
}

// --- Rótulos --------------------------------------------------------------------

/** "Quadra 3" como o organizador escreveu; só número vira "Quadra N". */
export function courtLabelOf(m: NextMatchLite): string | null {
  const court = m.courtName;
  if (!court) return null;
  return /^\d+$/.test(court) ? `Quadra ${court}` : court;
}

/**
 * "Q3" para a ilha compacta. Quadra com nome sai como foi escrita: abreviar
 * transformaria "Central" em charada (mesma regra do `_courtChipOf` do Focus).
 */
export function courtShortOf(m: NextMatchLite): string | null {
  const court = m.courtName;
  if (!court) return null;
  const digits = court.match(/\d+/)?.[0];
  return digits ? `Q${digits}` : court;
}

function isPoolMatch(m: NextMatchLite): boolean {
  return m.isGroupMatch || normalizeMatchType(m.matchType) === "group" || m.poolId !== "";
}

function poolLabelOf(poolId: string): string {
  if (!poolId) return "Fase de grupos";
  return poolId.toLowerCase().startsWith("grupo") ? poolId : `Grupo ${poolId}`;
}

const KNOCKOUT_BY_COUNT: Record<number, string> = {
  16: "32 avos de final",
  8: "Oitavas de final",
  4: "Quartas de final",
  2: "Semifinais",
  1: "Eliminatórias",
};

/**
 * "Grupo A · Rodada 2" (a posição da rodada DENTRO do grupo, não o `round`
 * cru, que em muitos torneios começa em zero), "Quartas de final" no mata-mata.
 */
export function phaseLabelOf(m: NextMatchLite, categoryMatches: NextMatchLite[]): string {
  if (isPoolMatch(m)) {
    const rounds = new Set([m.round]);
    for (const other of categoryMatches) {
      if (other.categoryId === m.categoryId && isPoolMatch(other) && other.poolId === m.poolId) {
        rounds.add(other.round);
      }
    }
    const position = [...rounds].sort((a, b) => a - b).indexOf(m.round) + 1;
    return `${poolLabelOf(m.poolId)} · Rodada ${position}`;
  }

  const type = normalizeMatchType(m.matchType);
  if (m.matchType === "WB" || m.matchType === "LB") {
    return m.round > 0 ? `${m.matchType}${m.round}` : m.matchType;
  }
  if (type === "final") return "Final";
  if (type === "grand final") return "Grand Final";
  if (type === "third place") return "3º lugar";
  if (type === "knockout") {
    const ids = new Set([m.id]);
    for (const other of categoryMatches) {
      if (
        other.categoryId === m.categoryId &&
        normalizeMatchType(other.matchType) === "knockout" &&
        other.round === m.round
      ) {
        ids.add(other.id);
      }
    }
    return KNOCKOUT_BY_COUNT[ids.size] ??
      (m.round > 0 ? `Mata-mata · Rodada ${m.round}` : "Mata-mata");
  }
  return m.round > 0 ? `Rodada ${m.round}` : "Partida";
}

/** Descrição da vaga ("Vencedor do Jogo 14"), nunca um id cru. */
function safeDescription(description: string | null): string | null {
  if (!description) return null;
  const parts = description.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const looksLikeId = (p: string) => /^[A-Za-z0-9_-]{20,}$/.test(p);
  return parts.every(looksLikeId) ? null : description;
}

function opponentOf(
  m: NextMatchLite,
  teamIds: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
): string {
  const iAmA = teamIds.has(m.teamAId);
  const id = iAmA ? m.teamBId : m.teamAId;
  const description = iAmA ? m.teamBDescription : m.teamADescription;
  return (id && names.get(id)) || safeDescription(description) || "A definir";
}

function timeOrQueue(m: NextMatchLite): string {
  return m.scheduleTime ? eventTimeLabel(m.scheduleTime) : "Fila";
}

function phaseOf(next: NextMatchLite): NextMatchPhase {
  if (isMatchInProgress(next.status)) return "playing";
  if (next.queueStatus === ON_COURT) return "called";
  return "scheduled";
}

function doneItemOf(m: NextMatchLite, teamIds: ReadonlySet<string>): NextMatchDayItem {
  const iAmA = teamIds.has(m.teamAId);
  const mine = iAmA ? m.setsWonA : m.setsWonB;
  const theirs = iAmA ? m.setsWonB : m.setsWonA;
  const score = `${mine}–${theirs}`;
  if (!m.winnerId) return {kind: "done", label: "Fim"};
  return teamIds.has(m.winnerId) ?
    {kind: "win", label: `V ${score}`} :
    {kind: "loss", label: `D ${score}`};
}

/** Janela da linha do dia: sempre com o próximo e, se couber, o seguinte. */
function windowOf<T>(items: T[], nextIndex: number): T[] {
  if (items.length <= NEXT_MATCH_MAX_DAY_ITEMS) return items;
  if (nextIndex < 0) return items.slice(-NEXT_MATCH_MAX_DAY_ITEMS);
  const end = Math.min(items.length, nextIndex + 2);
  const start = Math.max(0, end - NEXT_MATCH_MAX_DAY_ITEMS);
  return items.slice(start, start + NEXT_MATCH_MAX_DAY_ITEMS);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function summaryOf(items: NextMatchDayItem[]): string | null {
  const wins = items.filter((i) => i.kind === "win").length;
  const losses = items.filter((i) => i.kind === "loss").length;
  const parts = [
    wins > 0 ? plural(wins, "vitória", "vitórias") : "",
    losses > 0 ? plural(losses, "derrota", "derrotas") : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const WINNER_OF = /vencedor\s+(?:do\s+)?jogo\s*#?\s*(\d+)/i;
const LOSER_OF = /perdedor\s+(?:do\s+)?jogo\s*#?\s*(\d+)/i;
const PLACE_IN_GROUP = /º\s*(?:lugar\s+)?(?:do\s+)?grupo\s+(\S+)/i;

function groupKey(poolId: string): string {
  return poolId.trim().toLowerCase().replace(/^grupo\s+/, "");
}

/**
 * A vaga vazia de [slot] ainda pode ser do atleta? Pelo vínculo da chave
 * (`winnerAdvanceMatchNumber`/`loserAdvanceMatchNumber` de um jogo dele) ou,
 * em chave antiga sem vínculo, pela descrição da vaga: "Vencedor Jogo #14",
 * "Perdedor Jogo #14", "1º do grupo A".
 */
function slotCouldBeMine(
  slot: NextMatchLite,
  mine: NextMatchLite[],
  teamIds: ReadonlySet<string>,
): boolean {
  const done = mine.filter((m) => m.categoryId === slot.categoryId && isMatchCompleted(m.status));
  const won = (m: NextMatchLite) => m.winnerId !== null && teamIds.has(m.winnerId);
  const lost = (m: NextMatchLite) => m.winnerId !== null && !teamIds.has(m.winnerId);

  for (const m of done) {
    const target = won(m) ? m.winnerAdvanceMatchNumber : lost(m) ? m.loserAdvanceMatchNumber : null;
    if (target !== null && target === slot.matchNumber) return true;
  }

  const openSides = [
    slot.teamAId ? null : slot.teamADescription,
    slot.teamBId ? null : slot.teamBDescription,
  ].filter((d): d is string => !!d);
  const myGroups = new Set(
    mine.filter((m) => m.categoryId === slot.categoryId && isPoolMatch(m))
      .map((m) => groupKey(m.poolId)),
  );
  return openSides.some((description) => {
    const winnerOf = description.match(WINNER_OF)?.[1];
    if (winnerOf) return done.some((m) => m.matchNumber === Number(winnerOf) && won(m));
    const loserOf = description.match(LOSER_OF)?.[1];
    if (loserOf) return done.some((m) => m.matchNumber === Number(loserOf) && lost(m));
    const group = description.match(PLACE_IN_GROUP)?.[1];
    return group ? myGroups.has(groupKey(group)) : false;
  });
}

/**
 * Acabaram os jogos do atleta, mas a chave tem, hoje, uma vaga aberta que pode
 * ser dele? Encerrar a activity agora a mataria antes de a vaga ser
 * preenchida. Vaga que não pode ser dele (outro grupo, mata-mata perdido sem
 * repescagem) não segura o card.
 */
function awaitingBracket(
  categoryMatches: NextMatchLite[],
  teamIds: ReadonlySet<string>,
  dayKey: string,
): boolean {
  const mine = categoryMatches.filter((m) => isMine(m, teamIds));
  return categoryMatches.some(
    (m) =>
      !isMine(m, teamIds) &&
      (!m.teamAId || !m.teamBId) &&
      !isMatchCompleted(m.status) &&
      !isMatchCanceled(m.status) &&
      matchOnEventDay(m, dayKey) &&
      slotCouldBeMine(m, mine, teamIds),
  );
}

/**
 * O estado do card. `null` quando o atleta não tem partida nenhuma no dia — não
 * há o que mostrar, e a activity nem deve nascer.
 */
export function buildNextMatchState(input: BuildNextMatchStateInput): NextMatchContentState | null {
  const {matches, categoryMatches, teamIds, dayKey, teamNames} = input;
  const next = pickNextMatch(matches, teamIds, dayKey);
  const dayMatches = dayMatchesOf(matches, teamIds, dayKey);
  if (!next && dayMatches.length === 0) return null;

  const items = dayMatches.map((m): NextMatchDayItem => {
    if (isMatchCompleted(m.status)) return doneItemOf(m, teamIds);
    if (next && m.id === next.id) {
      const now = phaseOf(next) !== "scheduled";
      return {kind: "next", label: now ? "Agora" : timeOrQueue(m)};
    }
    return {kind: "upcoming", label: timeOrQueue(m)};
  });
  const nextIndex = next ? dayMatches.findIndex((m) => m.id === next.id) : -1;
  const day = windowOf(items, nextIndex);

  if (!next) {
    return {
      phase: awaitingBracket(categoryMatches, teamIds, dayKey) ? "waiting" : "dayOver",
      matchId: null,
      courtLabel: null,
      courtShort: null,
      opponent: "",
      phaseLabel: "",
      scheduleTimeMs: null,
      day,
      summary: summaryOf(items),
    };
  }

  return {
    phase: phaseOf(next),
    matchId: next.id,
    courtLabel: courtLabelOf(next),
    courtShort: courtShortOf(next),
    opponent: opponentOf(next, teamIds, teamNames),
    phaseLabel: phaseLabelOf(next, categoryMatches),
    scheduleTimeMs: next.scheduleTime ? next.scheduleTime.getTime() : null,
    day,
    summary: null,
  };
}

/** Chave para não mandar o mesmo estado duas vezes. */
export function nextMatchStateKey(state: NextMatchContentState): string {
  return JSON.stringify(state);
}

// --- Push -------------------------------------------------------------------------

export interface NextMatchMessageInput {
  fcmToken: string;
  liveActivityToken: string;
  state: NextMatchContentState;
  /** Fase do último push (ou do início); decide se a chamada vibra. */
  previousPhase: string | null;
  nowMs: number;
}

/**
 * Push de Live Activity pelo FCM. A chamada para a quadra é o ÚNICO momento
 * com alerta (e só na virada): o resto atualiza o card em silêncio.
 *
 * Na fase agendada o horário vai como `stale-date`: passou dele sem a partida
 * começar, o próprio iPhone mostra o atraso. Um update sem `stale-date` apaga o
 * anterior, por isso ele é repetido em todo push agendado.
 */
export function buildNextMatchMessage(input: NextMatchMessageInput): TokenMessage {
  const {fcmToken, liveActivityToken, state, previousPhase, nowMs} = input;
  const ending = state.phase === "dayOver";
  const aps: Record<string, unknown> = {
    "timestamp": Math.floor(nowMs / 1000),
    "event": ending ? "end" : "update",
    "content-state": state,
  };
  if (ending) {
    aps["dismissal-date"] = Math.floor((nowMs + NEXT_MATCH_DAY_OVER_DISMISS_MS) / 1000);
  } else if (
    state.phase === "scheduled" &&
    state.scheduleTimeMs !== null &&
    state.scheduleTimeMs > nowMs
  ) {
    // Horário já passado não vai: activity que nasce/fica "stale" na hora o
    // iOS não desenha (visto no simulador). O card calcula o atraso sozinho.
    aps["stale-date"] = Math.floor(state.scheduleTimeMs / 1000);
  }
  if (state.phase === "called" && previousPhase !== "called") {
    const court = state.courtLabel ?? "quadra";
    // Em Live Activity o som vai DENTRO do alert (no topo do aps é ignorado).
    aps["alert"] = {
      title: "Sua partida foi chamada",
      body: `Vá para a ${court} · vs ${state.opponent}`,
      sound: "default",
    };
  }
  return {
    token: fcmToken,
    apns: {
      liveActivityToken,
      headers: {"apns-priority": "10"},
      payload: {aps},
    },
  };
}

// --- Gatilho: o que muda o card -------------------------------------------------------

const WATCHED_FIELDS = [
  "status",
  "queueStatus",
  "scheduleTime",
  "courtName",
  "courtId",
  "teamAId",
  "teamBId",
  "teamADescription",
  "teamBDescription",
  "winnerId",
  "dayKey",
] as const;

function comparable(field: string, value: unknown): string {
  if (field === "status") return normalizeMatchStatusKey(value);
  const raw = value as {toMillis?: () => number} | null | undefined;
  if (raw && typeof raw.toMillis === "function") return String(raw.toMillis());
  if (value instanceof Date) return String(value.getTime());
  return JSON.stringify(value ?? null);
}

/**
 * Duplas cujo card pode ter mudado com esta escrita na partida. Vazio quando só
 * o placar mexeu — o gatilho dispara a cada ponto e tem de sair barato.
 */
export function nextMatchChangeTeamIds(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed = WATCHED_FIELDS.some(
    (f) => comparable(f, before[f]) !== comparable(f, after[f]),
  );
  if (!changed) return [];
  const ids = new Set<string>();
  for (const doc of [before, after]) {
    for (const key of ["teamAId", "teamBId"]) {
      const id = str(doc[key]);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * A escrita preencheu uma vaga da chave ou encerrou uma partida? Então quem
 * está "aguardando a próxima fase" no torneio precisa ser reavaliado, mesmo sem
 * estar nesta partida: a vaga pode ter ido para outra dupla (fim do dia dele)
 * ou para ele.
 */
export function nextMatchBracketMoved(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  const filled = ["teamAId", "teamBId"].some((k) => !str(before[k]) && !!str(after[k]));
  const completed = !isMatchCompleted(before.status) && isMatchCompleted(after.status);
  return filled || completed;
}
