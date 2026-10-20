/**
 * Placar do pós-jogo do aluguel de quadra (`bookingResults/{bookingId}`) — regras puras.
 *
 * Um placar por reserva, lançado pelo dono dela. Quem tem conta nos OUTROS times confirma ou
 * contesta; basta um adversário confirmar para o placar contar no histórico de todos que estão
 * nele (nunca no ranking). Avulsos (`guest:…`) não confirmam. As callables estão em
 * `booking-result-write.ts`.
 */

export const BOOKING_RESULTS = "bookingResults";

export const MAX_RESULT_TEAMS = 8;
export const MAX_TEAM_PLAYERS = 6;
export const MAX_RESULT_GAMES = 30;
export const MAX_GAME_SCORE = 99;
export const MAX_RESULT_NAME = 40;

/** Salvar de novo dentro desse intervalo não repete o push aos adversários. */
export const RESULT_RENOTIFY_MS = 10 * 60 * 1000;

export type BookingResultStatus = "pending" | "confirmed" | "disputed";
export type BookingResultResponse = "confirm" | "dispute";

/** Reserva que ainda não foi garantida: não tem jogo para lançar. */
const NOT_PLAYABLE_STATUSES = new Set(["canceled", "cancelled", "pending", "processing", "pending_payment"]);

export interface ResultPlayerInput {
  id: string;
  /** Só o do avulso vale; o nome de quem tem conta vem do servidor. */
  name: string;
  guest: boolean;
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
 * Lê o payload do "Salvar placar". `fields` lista o que está errado (vazio = ok); a primeira
 * mensagem amigável sai de [resultInputMessage].
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
    const players: ResultPlayerInput[] = [];
    for (const [j, rawPlayer] of rawPlayers.slice(0, MAX_TEAM_PLAYERS).entries()) {
      const p = (rawPlayer && typeof rawPlayer === "object" ? rawPlayer : {}) as Data;
      const pid = str(p["id"]);
      const guest = pid.startsWith("guest:");
      const name = str(p["name"]);
      const badName = guest && (name.length === 0 || name.length > MAX_RESULT_NAME);
      if (!isDocId(pid) || badName || seenPlayers.has(pid)) {
        fields.push(`teams.${i}.players.${j}`);
        continue;
      }
      seenPlayers.add(pid);
      players.push({id: pid, name: guest ? name : "", guest});
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
    games.push({teamA, teamB, scoreA, scoreB});
  }
  if (games.length > 0 && !games.some((g) => g.scoreA > 0 || g.scoreB > 0)) fields.push("games.score");

  return {input: {bookingId, teams, games}, fields};
}

/** A mensagem do primeiro problema do payload. */
export function resultInputMessage(fields: string[]): string {
  if (fields.includes("games.score")) return "Lance o placar de pelo menos um set.";
  if (fields.some((f) => f.startsWith("teams"))) return "Confira os times do placar.";
  return "Confira o placar.";
}

/**
 * Quem está no placar: `playerUids` (todos com conta, para a leitura) e `opponentUids` (com conta
 * fora do time de quem lançou — são eles que confirmam). `creatorTeamId` null = quem lançou não
 * está em time nenhum.
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
      if (p.guest) continue;
      playerUids.push(p.id);
      if (team !== creatorTeam) opponentUids.push(p.id);
    }
  }
  return {playerUids, opponentUids, creatorTeamId: creatorTeam?.id ?? null};
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

/**
 * Pode responder? Devolve a mensagem do impedimento, ou null. Só adversário com conta responde, só
 * enquanto ninguém respondeu, e só a versão que ele viu (o dono pode ter corrigido no meio).
 */
export function responseBlocker(
  doc: Data,
  uid: string,
  version: number,
): {code: "permission-denied" | "failed-precondition"; message: string} | null {
  const opponents = Array.isArray(doc["opponentUids"]) ? (doc["opponentUids"] as unknown[]) : [];
  if (!opponents.includes(uid)) {
    return {code: "permission-denied", message: "Só quem jogou do outro lado confirma o placar."};
  }
  const status = str(doc["status"]);
  if (status === "confirmed") return {code: "failed-precondition", message: "Esse placar já foi confirmado."};
  if (status === "disputed") {
    return {code: "failed-precondition", message: "Esse placar foi contestado e está sendo corrigido."};
  }
  if (doc["version"] !== version) {
    return {code: "failed-precondition", message: "O placar mudou. Confira de novo antes de responder."};
  }
  return null;
}

/** Time como o app mostra: o nome dado, senão "Maria & Enzo" pelos primeiros nomes. */
export function resultTeamLabel(team: {customName: string | null; players: {name: string}[]}): string {
  if (team.customName) return team.customName;
  const names = team.players.map((p) => firstName(p.name)).filter((n) => n.length > 0);
  if (names.length === 0) return "Adversários";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/**
 * O placar numa linha para o push: "Maria & Enzo 2–1 Rafael & Lia" (sets vencidos, time de quem
 * lançou primeiro); null na rotação, que não cabe numa linha.
 */
export function resultPushLine(
  teams: {id: number; customName: string | null; players: {name: string}[]}[],
  games: ResultGameInput[],
  creatorTeamId: number | null,
): string | null {
  if (teams.length !== 2) return null;
  const mine = teams.find((t) => t.id === creatorTeamId) ?? teams[0];
  const other = teams.find((t) => t !== mine)!;
  const wonBy = (id: number) => games.filter((g) => (g.teamA === id ? g.scoreA > g.scoreB : g.scoreB > g.scoreA)).length;
  return `${resultTeamLabel(mine)} ${wonBy(mine.id)}–${wonBy(other.id)} ${resultTeamLabel(other)}`;
}

/** `19/10` de um `YYYY-MM-DD`. */
export function shortDateLabel(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  return m ? `${m[3]}/${m[2]}` : "";
}
