/**
 * Placar do pós-jogo do aluguel de quadra — a "pelada" (`bookingResults/{bookingId}`), regras puras.
 *
 * Um placar por reserva, lançado (e editado) pelo dono dela. Todo mundo que está no placar, menos
 * quem lançou a versão atual, confirma ou contesta — companheiro de time também. Todos confirmados
 * → `confirmed`; qualquer contestação → `disputed` (com motivo); 48h sem contestação → a varredura
 * confirma sozinha. Editar volta tudo para `pending` com versão nova. Só `confirmed` conta nas
 * estatísticas e no perfil público; nunca no ranking. Todos os jogadores precisam ter conta (sem
 * avulso). As callables e a varredura estão em `booking-result-write.ts`.
 */

export const BOOKING_RESULTS = "bookingResults";

export const MAX_RESULT_TEAMS = 8;
export const MAX_TEAM_PLAYERS = 6;
export const MAX_RESULT_GAMES = 30;
export const MAX_GAME_SCORE = 99;
export const MAX_RESULT_NAME = 40;

/** Salvar de novo dentro desse intervalo não repete o push a quem já foi avisado. */
export const RESULT_RENOTIFY_MS = 10 * 60 * 1000;

/** Prazo para confirmar, contado da última edição: depois disso confirma sozinho. */
export const CONFIRM_WINDOW_MS = 48 * 60 * 60 * 1000;

/** O lembrete sai quando falta isso para o prazo. */
export const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

export const MIN_DISPUTE_REASON = 3;
export const MAX_DISPUTE_REASON = 140;

export type BookingResultStatus = "pending" | "confirmed" | "disputed";
export type BookingResultResponse = "confirm" | "dispute";
export type ConfirmationState = "pending" | "confirmed" | "disputed";
export type BookingResultFormat = "duo_vs_duo" | "king_of_court";

/** Reserva que ainda não foi garantida: não tem jogo para lançar. */
const NOT_PLAYABLE_STATUSES = new Set(["canceled", "cancelled", "pending", "processing", "pending_payment"]);

export interface ResultPlayerInput {
  id: string;
}

export interface ResultTeamInput {
  id: number;
  customName: string | null;
  players: ResultPlayerInput[];
}

export interface ResultGameInput {
  teamA: number;
  teamB: number;
  scoreA: number;
  scoreB: number;
}

export interface BookingResultInput {
  bookingId: string;
  teams: ResultTeamInput[];
  games: ResultGameInput[];
}

/** A resposta de um jogador a uma versão do placar. `at` é o Timestamp do servidor. */
export interface Confirmation {
  state: ConfirmationState;
  version: number;
  reason: string | null;
  /** Confirmado pela varredura do prazo, não pelo jogador. */
  auto: boolean;
  at: unknown;
}

export type Confirmations = Record<string, Confirmation>;

type Data = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isIndex(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

/** Id de documento seguro (sem barra, sem "." / ".."). */
export function isDocId(v: string): boolean {
  return v.length > 0 && v.length <= 128 && !v.includes("/") && v !== "." && v !== "..";
}

/**
 * Lê o payload do "Salvar placar". `fields` lista o que está errado (vazio = ok); a mensagem
 * amigável do primeiro problema sai de [resultInputMessage].
 */
export function parseBookingResultInput(raw: unknown): {input: BookingResultInput; fields: string[]} {
  const data = (raw && typeof raw === "object" ? raw : {}) as Data;
  const fields: string[] = [];
  const bookingId = str(data["bookingId"]);
  if (!isDocId(bookingId)) fields.push("bookingId");

  const teams: ResultTeamInput[] = [];
  const rawTeams = Array.isArray(data["teams"]) ? (data["teams"] as unknown[]) : [];
  if (rawTeams.length < 2 || rawTeams.length > MAX_RESULT_TEAMS) fields.push("teams");
  const seenPlayers = new Set<string>();
  for (const [i, rawTeam] of rawTeams.slice(0, MAX_RESULT_TEAMS).entries()) {
    const t = (rawTeam && typeof rawTeam === "object" ? rawTeam : {}) as Data;
    const id = t["id"];
    if (!isIndex(id, 99) || teams.some((x) => x.id === id)) {
      fields.push(`teams.${i}.id`);
      continue;
    }
    const customName = str(t["customName"]);
    if (customName.length > MAX_RESULT_NAME) fields.push(`teams.${i}.customName`);
    const rawPlayers = Array.isArray(t["players"]) ? (t["players"] as unknown[]) : [];
    if (rawPlayers.length > MAX_TEAM_PLAYERS) fields.push(`teams.${i}.players`);
    if (rawPlayers.length === 0) fields.push(`teams.${i}.empty`);
    const players: ResultPlayerInput[] = [];
    for (const [j, rawPlayer] of rawPlayers.slice(0, MAX_TEAM_PLAYERS).entries()) {
      const p = (rawPlayer && typeof rawPlayer === "object" ? rawPlayer : {}) as Data;
      const pid = str(p["id"]);
      if (pid.startsWith("guest:")) {
        fields.push(`teams.${i}.players.${j}.guest`);
        continue;
      }
      if (!isDocId(pid) || seenPlayers.has(pid)) {
        fields.push(`teams.${i}.players.${j}`);
        continue;
      }
      seenPlayers.add(pid);
      players.push({id: pid});
    }
    teams.push({id, customName: customName.length > 0 ? customName.slice(0, MAX_RESULT_NAME) : null, players});
  }

  const games: ResultGameInput[] = [];
  const rawGames = Array.isArray(data["games"]) ? (data["games"] as unknown[]) : [];
  if (rawGames.length < 1 || rawGames.length > MAX_RESULT_GAMES) fields.push("games");
  const teamIds = new Set(teams.map((t) => t.id));
  for (const [i, rawGame] of rawGames.slice(0, MAX_RESULT_GAMES).entries()) {
    const g = (rawGame && typeof rawGame === "object" ? rawGame : {}) as Data;
    const {teamA, teamB, scoreA, scoreB} = g;
    const ok = isIndex(teamA, 99) && isIndex(teamB, 99) && teamA !== teamB &&
      teamIds.has(teamA) && teamIds.has(teamB) &&
      isIndex(scoreA, MAX_GAME_SCORE) && isIndex(scoreB, MAX_GAME_SCORE);
    if (!ok) {
      fields.push(`games.${i}`);
      continue;
    }
    // Pelada não tem empate: todo jogo tem um vencedor (0×0 também é empate).
    if (scoreA === scoreB) fields.push(`games.${i}.tie`);
    games.push({teamA, teamB, scoreA, scoreB});
  }

  return {input: {bookingId, teams, games}, fields};
}

/** A mensagem do primeiro problema do payload. */
export function resultInputMessage(fields: string[]): string {
  const tie = fields.find((f) => /^games\.\d+\.tie$/.test(f));
  if (tie) return `O jogo ${Number(tie.split(".")[1]) + 1} está empatado: ajuste o placar.`;
  if (fields.some((f) => f.endsWith(".guest"))) {
    return "Todos os jogadores precisam ter conta no nexaGO.";
  }
  if (fields.some((f) => f.endsWith(".empty"))) return "Monte todos os times antes de salvar.";
  if (fields.some((f) => f.startsWith("teams"))) return "Confira os times do placar.";
  return "Confira o placar.";
}

/**
 * Quem está no placar: `playerUids` (todos, para a leitura e as confirmações) e `opponentUids` (fora
 * do time de quem lançou — campo do #781, mantido para quem ainda lê). `creatorTeamId` null = quem
 * lançou não está em time nenhum.
 */
export function resultParticipants(
  teams: ResultTeamInput[],
  creatorUid: string,
): {playerUids: string[]; opponentUids: string[]; creatorTeamId: number | null} {
  const creatorTeam = teams.find((t) => t.players.some((p) => p.id === creatorUid)) ?? null;
  const playerUids: string[] = [];
  const opponentUids: string[] = [];
  for (const team of teams) {
    for (const p of team.players) {
      playerUids.push(p.id);
      if (team !== creatorTeam) opponentUids.push(p.id);
    }
  }
  return {playerUids, opponentUids, creatorTeamId: creatorTeam?.id ?? null};
}

/** Dois times = sets entre duplas; três ou mais = rei da quadra (quem vence fica). */
export function resultFormat(teamCount: number): BookingResultFormat {
  return teamCount > 2 ? "king_of_court" : "duo_vs_duo";
}

/** A reserva já tem jogo para lançar: garantida e com o horário de início passado (parede SP). */
export function bookingResultOpenError(booking: Data, now: Date): string | null {
  const status = str(booking["status"]).toLowerCase();
  if (NOT_PLAYABLE_STATUSES.has(status)) return "O placar só abre em reserva garantida.";
  const startAt = bookingStartAt(str(booking["date"]) || str(booking["dateKey"]), str(booking["startTime"]));
  if (!startAt) return "Não achamos o horário dessa reserva.";
  if (startAt.getTime() > now.getTime()) return "O placar abre quando a partida começar.";
  return null;
}

/** `date` (YYYY-MM-DD) + `HH:mm` na parede de São Paulo → instante. */
export function bookingStartAt(dateKey: string, startTime: string): Date | null {
  const day = dateKey.slice(0, 10);
  const hhmm = startTime.slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const dt = new Date(`${day}T${hhmm}:00-03:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Fim da reserva; fim antes do início vira o dia seguinte (horário que passa da meia-noite). */
export function bookingEndAt(dateKey: string, startTime: string, endTime: string): Date | null {
  const start = bookingStartAt(dateKey, startTime);
  const end = bookingStartAt(dateKey, endTime);
  if (!start || !end) return null;
  return end.getTime() > start.getTime() ? end : new Date(end.getTime() + 24 * 60 * 60 * 1000);
}

/** Dono da reserva: o app grava `athleteId`; reservas antigas só `bookingAthleteId`. */
export function bookingOwnerUid(booking: Data): string {
  return str(booking["athleteId"]) || str(booking["bookingAthleteId"]);
}

/** Nome de quem tem conta — retrato do perfil, nunca o que o app mandou. */
export function resultPlayerName(user: Data | null): string {
  return (
    str(user?.["nickname"]) ||
    str(user?.["fullName"]) ||
    str(user?.["name"]) ||
    str(user?.["displayName"]) ||
    "Atleta"
  ).slice(0, 60);
}

export function resultPlayerPhoto(user: Data | null): string | null {
  const url = str(user?.["profilePhotoUrl"]) || str(user?.["photoUrl"]) || str(user?.["avatarUrl"]);
  return url.startsWith("https://") ? url : null;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Quem lançou a versão atual — não confirma a si mesmo. Doc do #781 não tem `editedBy`. */
export function resultEditorUid(doc: Data): string {
  return str(doc["editedBy"]) || str(doc["createdBy"]);
}

/** Confirmações de uma versão nova: quem lançou já entra confirmado, o resto pendente. */
export function freshConfirmations(playerUids: string[], editorUid: string, version: number, at: unknown): Confirmations {
  const out: Confirmations = {};
  for (const uid of playerUids) {
    out[uid] = uid === editorUid ?
      {state: "confirmed", version, reason: null, auto: false, at} :
      {state: "pending", version, reason: null, auto: false, at: null};
  }
  return out;
}

/**
 * As confirmações do doc. Placar do #781 não tem o mapa: quem lançou conta como confirmado, e o
 * `status` antigo decide o resto (confirmado = todos; contestado = quem respondeu).
 */
export function confirmationsOf(doc: Data): Confirmations {
  const version = typeof doc["version"] === "number" ? (doc["version"] as number) : 0;
  const raw = doc["confirmations"];
  const players = Array.isArray(doc["playerUids"]) ? (doc["playerUids"] as unknown[]).map(str) : [];
  if (raw && typeof raw === "object") {
    const out: Confirmations = {};
    for (const uid of players) {
      const c = ((raw as Data)[uid] ?? {}) as Data;
      const state = str(c["state"]);
      out[uid] = {
        state: state === "confirmed" || state === "disputed" ? state : "pending",
        version: typeof c["version"] === "number" ? (c["version"] as number) : version,
        reason: str(c["reason"]) || null,
        auto: c["auto"] === true,
        at: c["at"] ?? null,
      };
    }
    return out;
  }
  const out = freshConfirmations(players, resultEditorUid(doc), version, doc["createdAt"] ?? null);
  const status = str(doc["status"]);
  if (status === "confirmed") {
    for (const uid of players) out[uid] = {...out[uid], state: "confirmed"};
  }
  const respondedBy = str(doc["respondedBy"]);
  if (status === "disputed" && out[respondedBy]) out[respondedBy] = {...out[respondedBy], state: "disputed"};
  return out;
}

/** Quem ainda não respondeu à versão atual. */
export function pendingUidsOf(confirmations: Confirmations): string[] {
  return Object.entries(confirmations).filter(([, c]) => c.state === "pending").map(([uid]) => uid);
}

/** Estado do placar pelas confirmações: uma contestação basta; confirmado só com todos. */
export function statusOf(confirmations: Confirmations): BookingResultStatus {
  const states = Object.values(confirmations).map((c) => c.state);
  if (states.includes("disputed")) return "disputed";
  return states.every((s) => s === "confirmed") ? "confirmed" : "pending";
}

/** Motivo da contestação, normalizado; null se curto, longo ou ausente. */
export function parseDisputeReason(raw: unknown): string | null {
  const reason = str(raw).replace(/\s+/g, " ");
  if (reason.length < MIN_DISPUTE_REASON || reason.length > MAX_DISPUTE_REASON) return null;
  return reason;
}

/**
 * Pode responder? Devolve o impedimento, ou null. Responde quem está no placar, menos quem lançou
 * a versão; só enquanto o placar está pendente, só uma vez, e só a versão que viu (o dono pode ter
 * corrigido no meio — `aborted` é o 409 que o app trata recarregando).
 */
export function responseBlocker(
  doc: Data,
  uid: string,
  version: number,
): {code: "permission-denied" | "failed-precondition" | "aborted"; message: string} | null {
  const players = Array.isArray(doc["playerUids"]) ? (doc["playerUids"] as unknown[]) : [];
  if (!players.includes(uid)) {
    return {code: "permission-denied", message: "Só quem está no placar confirma."};
  }
  if (uid === resultEditorUid(doc)) {
    return {code: "permission-denied", message: "Quem lançou o placar não confirma a própria versão."};
  }
  const status = str(doc["status"]);
  if (status === "confirmed") return {code: "failed-precondition", message: "Esse placar já foi confirmado."};
  if (status === "disputed") {
    return {code: "failed-precondition", message: "Esse placar foi contestado e está sendo corrigido."};
  }
  if (doc["version"] !== version) {
    return {code: "aborted", message: "O placar foi alterado. Confira antes de confirmar."};
  }
  if (confirmationsOf(doc)[uid]?.state !== "pending") {
    return {code: "failed-precondition", message: "Você já respondeu a esse placar."};
  }
  return null;
}

/** Confirmações depois da resposta de [uid]. */
export function confirmationsAfterResponse(
  confirmations: Confirmations,
  uid: string,
  response: BookingResultResponse,
  version: number,
  reason: string | null,
  at: unknown,
): Confirmations {
  return {
    ...confirmations,
    [uid]: {
      state: response === "confirm" ? "confirmed" : "disputed",
      version,
      reason: response === "dispute" ? reason : null,
      auto: false,
      at,
    },
  };
}

/** Prazo vencido: quem não respondeu passa a confirmado (sem push — silencioso). */
export function autoConfirmedConfirmations(confirmations: Confirmations, at: unknown): Confirmations {
  const out: Confirmations = {};
  for (const [uid, c] of Object.entries(confirmations)) {
    out[uid] = c.state === "pending" ? {...c, state: "confirmed", auto: true, at} : c;
  }
  return out;
}

/** O que a varredura faz com um placar pendente agora. */
export function sweepAction(doc: Data, nowMs: number): "auto_confirm" | "remind" | null {
  if (str(doc["status"]) !== "pending") return null;
  const deadline = (doc["confirmDeadline"] as {toMillis?: () => number} | null | undefined)?.toMillis?.();
  if (typeof deadline !== "number") return null;
  if (deadline <= nowMs) return "auto_confirm";
  const reminded = doc["remindedAt"] != null;
  if (!reminded && deadline - nowMs <= REMINDER_BEFORE_MS) return "remind";
  return null;
}

/** `19/10` de um `YYYY-MM-DD`. */
export function shortDateLabel(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  return m ? `${m[3]}/${m[2]}` : "";
}

/** Textos dos avisos (spec Peladas §8). */
export function pendingPushBody(creatorName: string, arenaName: string, dateKey: string): string {
  const when = shortDateLabel(dateKey);
  return `${firstName(creatorName)} lançou o placar de ${arenaName}${when ? ` · ${when}` : ""}. Confere?`;
}

export function reminderPushBody(arenaName: string, dateKey: string): string {
  const when = shortDateLabel(dateKey);
  return `Falta confirmar o placar de ${when || "um jogo"} na ${arenaName}.`;
}

export function disputePushBody(responderName: string, reason: string): string {
  return `${firstName(responderName)} contestou o placar: ${reason}`;
}
