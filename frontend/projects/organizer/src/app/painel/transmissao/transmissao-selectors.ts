import { isKingOfCourtMatchType } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { formatCourtLabel, spTimeLabel } from '../data/schedule-format';
import type { OrganizerTeamPlayers, ProfileDisplay } from '../data/teams-repository';
import { courtNowOf, type CourtNowKind } from '../telao/telao-selectors';

export interface RosterMember {
  uid: string;
  name: string;
  photoUrl: string | null;
}

/** Elenco resolvido de uma equipe: dupla (2) ou equipe nomeada (3–5). */
export interface TeamRoster {
  teamName: string | null;
  members: RosterMember[];
}

/** Atleta que pode ir pra tarja. A chave é por EQUIPE: quem joga duas categorias aparece duas
 *  vezes, cada uma com a sua categoria e o seu parceiro. */
export interface InterviewCandidate {
  key: string;
  teamId: string;
  uid: string;
  name: string;
  photoUrl: string | null;
  partnerName: string | null;
  categoryName: string | null;
}

export interface CourtChip {
  id: string;
  name: string;
  status: string;
  live: boolean;
}

/** Duelo tem dois lados; rodada KOTC tem o elenco em `koc.teamIds`. */
export function teamIdsOfMatch(m: TournamentMatch): string[] {
  return [m.teamAId, m.teamBId, ...(m.koc?.teamIds ?? [])].filter((id) => id !== '');
}

/** Dupla legada não tem `memberUids` — os dois slots são o elenco. */
export function rosterUidsOf(team: OrganizerTeamPlayers): string[] {
  const uids = team.memberUids.length > 0 ? [...team.memberUids] : [team.player1Id, team.player2Id];
  return [...new Set(uids.filter((u) => u !== ''))];
}

export function rosterOf(team: OrganizerTeamPlayers, profiles: ReadonlyMap<string, ProfileDisplay>): TeamRoster {
  return {
    teamName: team.teamName,
    members: rosterUidsOf(team).map((uid) => ({
      uid,
      name: profiles.get(uid)?.name ?? '',
      photoUrl: profiles.get(uid)?.photoUrl ?? null,
    })),
  };
}

/** Todos os atletas das partidas do torneio (coleções públicas — serve à gestão e à mídia, que
 *  não lê `inscriptions`). Antes da chave existir a lista é vazia: a transmissão é com jogos. */
export function interviewCandidatesOf(
  matches: readonly TournamentMatch[],
  rosters: ReadonlyMap<string, TeamRoster>,
  categories: readonly { id: string; name: string }[],
): InterviewCandidate[] {
  const categoryOfTeam = new Map<string, string | null>();
  for (const m of matches) {
    for (const id of teamIdsOfMatch(m)) if (!categoryOfTeam.has(id)) categoryOfTeam.set(id, m.categoryId);
  }
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const out: InterviewCandidate[] = [];
  for (const [teamId, categoryId] of categoryOfTeam) {
    const roster = rosters.get(teamId);
    if (!roster) continue;
    const named = roster.members.filter((p) => p.name.trim() !== '');
    for (const member of named) {
      const partner = named.length === 2 ? (named.find((o) => o.uid !== member.uid)?.name ?? null) : null;
      out.push({
        key: `${teamId}:${member.uid}`,
        teamId,
        uid: member.uid,
        name: member.name,
        photoUrl: member.photoUrl,
        partnerName: partner,
        categoryName: categoryId ? (categoryName.get(categoryId) ?? null) : null,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Quem está na quadra transmitida — quem costuma ser entrevistado. */
export function quickPicksOf(candidates: readonly InterviewCandidate[], match: TournamentMatch | null): InterviewCandidate[] {
  if (!match) return [];
  const ids = new Set(teamIdsOfMatch(match));
  return candidates.filter((c) => ids.has(c.teamId));
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchCandidates(candidates: readonly InterviewCandidate[], term: string): InterviewCandidate[] {
  const q = fold(term);
  if (!q) return [];
  return candidates.filter((c) => fold(c.name).includes(q)).slice(0, 12);
}

function courtStatusLabel(kind: CourtNowKind, m: TournamentMatch | null): string {
  if (kind === 'live' && m) {
    return isKingOfCourtMatchType(m.matchType) ? 'Ao vivo · King of the Court' : `Ao vivo · ${m.team1Label} × ${m.team2Label}`;
  }
  if (kind === 'next' && m?.scheduledAt) return `Próximo ${spTimeLabel(m.scheduledAt)}`;
  if (kind === 'finished') return 'Acabou de terminar';
  return 'Livre';
}

/** Chips de quadra, na ordem cadastrada, com o que está em cada uma agora. */
export function courtChipsOf(
  courts: readonly { id: string; name: string; order: number }[],
  matches: readonly TournamentMatch[],
  nowMs: number,
): CourtChip[] {
  return [...courts]
    .sort((a, b) => a.order - b.order)
    .map((court) => {
      const { kind, match } = courtNowOf(matches, court.id, nowMs);
      return { id: court.id, name: formatCourtLabel(court.name), live: kind === 'live', status: courtStatusLabel(kind, match) };
    });
}

export function courtMatchOf(matches: readonly TournamentMatch[], courtId: string | null, nowMs: number): TournamentMatch | null {
  if (!courtId) return null;
  return courtNowOf(matches, courtId, nowMs).match;
}

/** "0:12" — tempo da tarja no ar. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function transmissaoUrl(origin: string, tournamentId: string): string {
  return `${origin}/transmissao/${encodeURIComponent(tournamentId)}`;
}
