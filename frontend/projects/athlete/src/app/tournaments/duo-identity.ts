import type { ArenaTeam } from '../data/teams-repository';
import type { AthletePublicProfile } from '../data/public-profiles-repository';

/** O que um círculo de avatar renderiza: a foto quando existe, senão as iniciais. */
export interface DuoPlayer {
  initial: string;
  photo: string | null;
}

/**
 * Como uma dupla se apresenta — nome e retratos — a partir dos documentos crus de `teams` e
 * `public_profiles`.
 *
 * Mora fora do `TournamentLiveStore` porque tem DOIS consumidores com ciclos de vida diferentes:
 * o store (que nasce e morre na rota do torneio) e a HOME do atleta, que monta o card de campanha
 * sem nunca entrar num torneio. Copiar as regras para a home traria de volta o problema que este
 * projeto já registrou várias vezes — duas cópias da mesma derivação que divergem na primeira
 * mudança. O store passou a delegar para cá.
 */
export type TeamsById = ReadonlyMap<string, ArenaTeam>;
export type ProfilesById = ReadonlyMap<string, AthletePublicProfile>;

function initialsOf(name: string): string {
  const parts = name
    .replace(/\s*[&/]\s*/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '—';
}

function firstNameOf(full: string | undefined): string | null {
  const name = full?.trim().split(/\s+/)[0];
  return name ? name : null;
}

/** "Marcelo / Enzo" — nome cadastrado da equipe, senão os primeiros nomes da dupla. */
export function duoNameOf(teams: TeamsById, profiles: ProfilesById, teamId: string, fallback: string | null = null): string {
  if (!teamId) return fallback ?? 'A definir';
  const team = teams.get(teamId);
  if (!team) return fallback ?? 'Dupla';
  if (team.teamName) return team.teamName;
  const p1 = firstNameOf(profiles.get(team.player1Id)?.displayName);
  const p2 = firstNameOf(profiles.get(team.player2Id)?.displayName);
  if (!p1 && !p2) return fallback ?? 'Dupla';
  // Dupla ainda procurando parceiro grava o mesmo uid nos dois slots.
  if (team.player1Id === team.player2Id) return p1 ?? fallback ?? 'Dupla';
  return `${p1 ?? 'Atleta'} / ${p2 ?? 'Atleta'}`;
}

export function duoInitialsOf(teams: TeamsById, profiles: ProfilesById, teamId: string): [string, string] {
  const team = teams.get(teamId);
  if (!team) return ['—', '—'];
  const p1 = profiles.get(team.player1Id)?.displayName;
  const p2 = profiles.get(team.player2Id)?.displayName;
  return [p1 ? initialsOf(p1).slice(0, 2) : '—', p2 ? initialsOf(p2).slice(0, 2) : '—'];
}

export function duoAvatarsOf(teams: TeamsById, profiles: ProfilesById, teamId: string): [string | null, string | null] {
  const team = teams.get(teamId);
  if (!team) return [null, null];
  return [profiles.get(team.player1Id)?.avatarUrl ?? null, profiles.get(team.player2Id)?.avatarUrl ?? null];
}

/** Foto + inicial de cada atleta da dupla, na ordem player1/player2 — o par que os cards de
 *  partida e o card de campanha renderizam. */
export function duoPlayersOf(teams: TeamsById, profiles: ProfilesById, teamId: string): [DuoPlayer, DuoPlayer] {
  const initials = duoInitialsOf(teams, profiles, teamId);
  const avatars = duoAvatarsOf(teams, profiles, teamId);
  return [
    { initial: initials[0], photo: avatars[0] },
    { initial: initials[1], photo: avatars[1] },
  ];
}
