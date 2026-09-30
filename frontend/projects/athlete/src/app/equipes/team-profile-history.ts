import { matchIsCompleted, roundShortLabel, titleTournamentIds, type ArenaMatch } from '../data/teams-repository';
import { tournamentListingStatus, type TournamentSummary } from '../data/tournaments-repository';
import { matchScoreLabel } from '../profile/public-profile-activity';
import type { TeamMatchResult, TeamTournamentRow, TeamTournamentStatus } from './team-profile.models';

const MATCH_DATE_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/**
 * Linha do histórico de partidas da equipe.
 *
 * O adversário vem de `opponentName` (o id resolvido em `teams` → `public_profiles`, ver
 * `duoNameOf`): o `teamADescription`/`teamBDescription` do doc da partida é o apelido da VAGA na
 * chave ("Vencedor Jogo #5", "1º Grupo A") — diz de onde o adversário veio, não quem ele é. Ele
 * só entra como fallback, quando a equipe adversária não existe mais.
 */
export function buildTeamMatchResult(
  match: ArenaMatch,
  teamId: string,
  tournamentNames: ReadonlyMap<string, string>,
  opponentName: (teamId: string, fallback: string | null) => string,
): TeamMatchResult {
  const isTeamA = match.teamAId === teamId;
  return {
    id: match.id,
    result: match.winnerId === teamId ? 'V' : 'D',
    opponent: isTeamA ? opponentName(match.teamBId, match.teamBDescription) : opponentName(match.teamAId, match.teamADescription),
    contextLabel: `${tournamentNames.get(match.tournamentId) ?? 'Torneio'} · ${roundShortLabel(match.matchType)}`,
    // Sets na perspectiva da equipe ("2–0" numa vitória), não na ordem A/B do doc — senão o
    // lado B vencedor aparecia com "0 / 1".
    score: matchScoreLabel(match, isTeamA),
    dateLabel: match.matchEndedAt ? MATCH_DATE_FMT.format(match.matchEndedAt) : '—',
  };
}

const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "12 set 2026" — sem o ponto nem o "de" que o `Intl` pt-BR põe no mês abreviado. */
function tournamentDateLabel(d: Date | null): string {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Torneios da equipe (aba Torneios do perfil): a união das inscrições confirmadas com os torneios
 * onde ela tem partida. As duas fontes se completam — a inscrição traz o torneio que ainda não
 * gerou chave; a partida traz o torneio cuja inscrição o organizador já removeu depois de jogado.
 *
 * Torneio que não existe mais some (sem nome não há o que mostrar). Rascunho/cancelado só fica
 * se a equipe chegou a jogar lá — senão ela não participou de nada.
 */
export function buildTeamTournamentRows(input: {
  teamId: string;
  registrations: readonly { tournamentId: string; categoryId: string }[];
  matches: readonly ArenaMatch[];
  tournaments: ReadonlyMap<string, TournamentSummary>;
  now?: Date;
}): TeamTournamentRow[] {
  const { teamId, registrations, matches, tournaments } = input;
  const now = input.now ?? new Date();

  const categoryByTournament = new Map<string, string>();
  for (const r of registrations) {
    const tid = r.tournamentId.trim();
    if (tid && r.categoryId.trim() && !categoryByTournament.has(tid)) categoryByTournament.set(tid, r.categoryId.trim());
  }
  const matchesByTournament = new Map<string, ArenaMatch[]>();
  for (const m of matches) {
    const tid = m.tournamentId.trim();
    if (!tid) continue;
    const list = matchesByTournament.get(tid) ?? [];
    list.push(m);
    matchesByTournament.set(tid, list);
    if (m.categoryId.trim() && !categoryByTournament.has(tid)) categoryByTournament.set(tid, m.categoryId.trim());
  }

  const titles = new Set(titleTournamentIds(matches, teamId));
  const tournamentIds = new Set([...categoryByTournament.keys(), ...matchesByTournament.keys()]);

  const rows: TeamTournamentRow[] = [];
  for (const id of tournamentIds) {
    const summary = tournaments.get(id);
    if (!summary) continue;

    const decided = (matchesByTournament.get(id) ?? []).filter((m) => matchIsCompleted(m) && m.winnerId);
    if (summary.isDraftOrCancelled && decided.length === 0) continue;

    const wins = decided.filter((m) => m.winnerId === teamId).length;
    const categoryId = categoryByTournament.get(id);
    const category = categoryId ? summary.categories.find((c) => c.id === categoryId) : undefined;
    const lastPlayed = decided.reduce<Date | null>((latest, m) => {
      const at = m.matchEndedAt ?? m.scheduleTime;
      return at && (!latest || at > latest) ? at : latest;
    }, null);
    const date = summary.startAt ?? lastPlayed;
    const listing = tournamentListingStatus(summary, now);
    const status: TeamTournamentStatus = titles.has(id) ? 'title' : listing === 'live' ? 'live' : listing === 'ended' ? 'ended' : 'upcoming';
    const losses = decided.length - wins;
    const record = decided.length > 0 ? `${wins}V · ${losses}D` : null;

    rows.push({
      id,
      name: summary.name,
      contextLabel: [category?.categoryName, summary.city || summary.location, tournamentDateLabel(date)].filter((p) => p).join(' · '),
      date,
      status,
      badge: teamTournamentBadge(status, record),
      // O placar geral some quando já é o próprio selo (encerrado sem título).
      recordLabel: status === 'ended' ? null : record,
    });
  }

  return rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}

/** Selo à direita da linha: título manda; depois o momento do torneio; encerrado sem partida
 *  decidida (W.O., chave nunca gerada) cai em "Encerrado" em vez de um "0V · 0D" vazio. */
function teamTournamentBadge(status: TeamTournamentStatus, record: string | null): string {
  switch (status) {
    case 'title':
      return 'Campeã';
    case 'live':
      return 'Ao vivo';
    case 'upcoming':
      return 'Inscrita';
    case 'ended':
      return record ?? 'Encerrado';
  }
}
