import { collection, getDocs, limit, query, where, type DocumentData, type Firestore } from 'firebase/firestore';

/**
 * Peladas do perfil público (spec "Peladas 00d", porte de `nexago_app/lib/features/arenas/domain/pelada.dart`).
 *
 * Pelada = placar do pós-jogo de um aluguel de quadra (`bookingResults/{bookingId}`). A rule só entrega
 * a terceiros o placar `confirmed` (e exige login), então a busca já filtra o status: a mesma query do
 * app (`watchConfirmedOf`), com o índice `playerUids` + `status`. Posição e campanha saem da mesma
 * classificação do app e do servidor.
 */

export interface PeladaPlayer {
  id: string;
  name: string;
}

export interface PeladaTeam {
  id: number;
  players: readonly PeladaPlayer[];
}

export interface PeladaGame {
  teamA: number;
  teamB: number;
  scoreA: number;
  scoreB: number;
}

export interface SavedPelada {
  bookingId: string;
  arenaName: string;
  courtName: string | null;
  /** Dia da reserva na parede da arena (`YYYY-MM-DD`) — nunca um instante UTC. */
  dateKey: string;
  startTime: string;
  endTime: string;
  status: string;
  teams: readonly PeladaTeam[];
  games: readonly PeladaGame[];
}

export interface PeladaStanding {
  teamId: number;
  wins: number;
  /** Jogos do time que não venceu (pelada não tem empate). */
  losses: number;
  pointDiff: number;
  pointsFor: number;
  /** 1, 2, 3… — empate em vitórias, saldo e pontos feitos divide a posição. */
  position: number;
}

/** A pelada do ponto de vista de um jogador. */
export interface PeladaMine {
  wins: number;
  losses: number;
  balance: number;
  position: number;
  teamsCount: number;
}

/** Os números do ano no perfil público: só pelada confirmada conta. */
export interface PeladasSummary {
  year: number;
  sessions: number;
  games: number;
  wins: number;
  firstPlaces: number;
  winRatePercent: number;
}

export interface PublicProfilePeladaRow {
  id: string;
  /** `QUA` */
  weekday: string;
  /** `14` */
  day: string;
  /** `OUT` */
  month: string;
  arenaName: string;
  /** `09:00–10:30 · Quadra 1` */
  placeLabel: string;
  /** `2V · 1D` */
  recordLabel: string;
  /** `1º de 2` */
  positionLabel: string;
  isFirst: boolean;
}

const COLLECTION = 'bookingResults';
/** Mesmo teto do app. Sem `orderBy`: a ordem sai do `dateKey` aqui. */
const QUERY_LIMIT = 200;
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** Lê `bookingResults/{id}` como o `SavedBookingResult.fromFirestore` do app; `null` = doc inválido. */
export function parsePelada(id: string, d: DocumentData): SavedPelada | null {
  const rawTeams: unknown = d['teams'];
  const rawGames: unknown = d['games'];
  if (str(d['createdBy']).length === 0 || !Array.isArray(rawTeams) || !Array.isArray(rawGames)) {
    return null;
  }

  const teams: PeladaTeam[] = [];
  for (const t of rawTeams as unknown[]) {
    if (t == null || typeof t !== 'object') continue;
    const team = t as Record<string, unknown>;
    const teamId = int(team['id']);
    if (teamId == null) continue;
    const players: PeladaPlayer[] = [];
    for (const p of Array.isArray(team['players']) ? (team['players'] as unknown[]) : []) {
      if (p == null || typeof p !== 'object') continue;
      const player = p as Record<string, unknown>;
      const playerId = str(player['id']);
      if (playerId.length === 0) continue;
      players.push({ id: playerId, name: str(player['name']) || 'Atleta' });
    }
    teams.push({ id: teamId, players });
  }

  const games: PeladaGame[] = [];
  for (const g of rawGames as unknown[]) {
    if (g == null || typeof g !== 'object') continue;
    const game = g as Record<string, unknown>;
    const [teamA, teamB, scoreA, scoreB] = [int(game['teamA']), int(game['teamB']), int(game['scoreA']), int(game['scoreB'])];
    if (teamA == null || teamB == null || scoreA == null || scoreB == null) continue;
    games.push({ teamA, teamB, scoreA, scoreB });
  }

  if (teams.length < 2 || games.length === 0) return null;
  return {
    bookingId: str(d['bookingId']) || id,
    arenaName: str(d['arenaName']) || 'Arena',
    courtName: str(d['courtName']) || null,
    dateKey: str(d['dateKey']),
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    status: str(d['status']),
    teams,
    games,
  };
}

function winnerOf(g: PeladaGame): number | null {
  if (g.scoreA === g.scoreB) return null;
  return g.scoreA > g.scoreB ? g.teamA : g.teamB;
}

/** Classificação (spec Peladas §3): vitórias, depois saldo, depois pontos feitos. Mesma conta do app. */
export function peladaStandings(p: SavedPelada): PeladaStanding[] {
  const rows = p.teams.map((team) => {
    const mine = p.games.filter((g) => g.teamA === team.id || g.teamB === team.id);
    const wins = mine.filter((g) => winnerOf(g) === team.id).length;
    const pointsFor = mine.reduce((sum, g) => sum + (g.teamA === team.id ? g.scoreA : g.scoreB), 0);
    const against = mine.reduce((sum, g) => sum + (g.teamA === team.id ? g.scoreB : g.scoreA), 0);
    return { teamId: team.id, wins, losses: mine.length - wins, pointDiff: pointsFor - against, pointsFor, position: 1 };
  });
  const compare = (x: PeladaStanding, y: PeladaStanding): number =>
    y.wins - x.wins || y.pointDiff - x.pointDiff || y.pointsFor - x.pointsFor;
  // `sort` é estável: empate total mantém a ordem dos times.
  const sorted = [...rows].sort(compare);
  sorted.forEach((row, i) => {
    row.position = i > 0 && compare(sorted[i - 1], row) === 0 ? sorted[i - 1].position : i + 1;
  });
  return sorted;
}

export function peladaMineOf(p: SavedPelada, uid: string): PeladaMine | null {
  const team = p.teams.find((t) => t.players.some((player) => player.id === uid));
  if (!team) return null;
  const mine = peladaStandings(p).find((s) => s.teamId === team.id)!;
  return {
    wins: mine.wins,
    losses: mine.losses,
    balance: mine.pointDiff,
    position: mine.position,
    teamsCount: p.teams.length,
  };
}

function wallDateParts(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function sortKey(p: SavedPelada): string {
  return `${p.dateKey.slice(0, 10)} ${p.startTime}`;
}

/** As peladas de [uid] (só as em que joga), mais recentes primeiro pela data e hora da reserva. */
export function peladasOf(all: readonly SavedPelada[], uid: string): SavedPelada[] {
  return all
    .filter((p) => wallDateParts(p.dateKey) != null && p.teams.some((t) => t.players.some((player) => player.id === uid)))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

export function peladasSummary(all: readonly SavedPelada[], uid: string, year: number): PeladasSummary {
  let sessions = 0;
  let games = 0;
  let wins = 0;
  let firstPlaces = 0;
  for (const p of all) {
    if (p.status !== 'confirmed' || wallDateParts(p.dateKey)?.year !== year) continue;
    const mine = peladaMineOf(p, uid);
    if (!mine) continue;
    sessions++;
    games += mine.wins + mine.losses;
    wins += mine.wins;
    if (mine.position === 1) firstPlaces++;
  }
  return { year, sessions, games, wins, firstPlaces, winRatePercent: games === 0 ? 0 : Math.round((wins / games) * 100) };
}

/** A linha do card, do ponto de vista do dono do perfil; `null` se ele não jogou. */
export function buildPeladaRow(p: SavedPelada, uid: string): PublicProfilePeladaRow | null {
  const mine = peladaMineOf(p, uid);
  const date = wallDateParts(p.dateKey);
  if (!mine || !date) return null;
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const hm = (v: string): string => v.slice(0, 5);
  return {
    id: p.bookingId,
    weekday: WEEKDAYS[weekday],
    day: String(date.day).padStart(2, '0'),
    month: MONTHS[date.month - 1] ?? '',
    arenaName: p.arenaName,
    placeLabel: [`${hm(p.startTime)}–${hm(p.endTime)}`, p.courtName].filter((part) => part).join(' · '),
    recordLabel: `${mine.wins}V · ${mine.losses}D`,
    positionLabel: `${mine.position}º de ${mine.teamsCount}`,
    isFirst: mine.position === 1,
  };
}

/** Peladas confirmadas de [uid]. Falha de leitura (sem login, sem índice) vira lista vazia: o card some. */
export async function loadConfirmedPeladas(db: Firestore, uid: string): Promise<SavedPelada[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTION),
        where('playerUids', 'array-contains', uid),
        where('status', '==', 'confirmed'),
        limit(QUERY_LIMIT),
      ),
    );
    return snap.docs.map((d) => parsePelada(d.id, d.data())).filter((p): p is SavedPelada => p != null);
  } catch {
    return [];
  }
}
