/** Roster público do torneio: quem já tem vaga confirmada, agrupado por categoria.
 *
 *  Espelho de `nexago_app/lib/features/tournaments/domain/tournament_enrolled_athletes_logic.dart`.
 *  As duas cópias TÊM de concordar — a mesma inscrição não pode ser "confirmada" no app e pendente
 *  aqui. Mexeu numa regra, mexa na outra (e nos dois specs). */

import { initialsOf } from '../profile/profile-format';

/** O que a tela precisa de um perfil — recorte estrutural de `AthletePublicProfile`. */
export interface RosterProfile {
  displayName: string;
  avatarUrl: string | null;
}

/** Recorte estrutural de `TournamentCategoryOffer`. */
export interface RosterCategory {
  id: string;
  categoryName: string;
}

/** Inscrição crua + o doc de equipe dela, quando existe. */
export interface RosterRow {
  registrationId: string;
  inscription: Record<string, unknown>;
  team: Record<string, unknown> | null;
}

export interface EnrolledTeamMember {
  uid: string;
  name: string;
  initials: string;
  photoUrl: string | null;
}

export interface EnrolledTeam {
  registrationId: string;
  teamId: string;
  displayName: string;
  members: EnrolledTeamMember[];
  categoryId: string;
  categoryName: string;
}

export interface EnrolledTeamGroup {
  categoryId: string;
  categoryName: string;
  teams: EnrolledTeam[];
}

const UNKNOWN_ATHLETE = 'Atleta';

function trimmedStr(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Inscrição confirmada pro roster público: paga, fora da fila e com elenco fechado. É a mesma
 *  regra que o painel usa pra "confirmada" e que a chave exige pra gerar jogo — reserva solo ou
 *  waitlist não entra na lista. */
export function isConfirmedInscription(inscription: Record<string, unknown>): boolean {
  return inscription['isPaid'] === true && inscription['waitlist'] !== true && inscription['partnerPending'] !== true;
}

/** Uids do elenco da inscrição, em ordem estável.
 *
 *  União de `participantUids` (equipe), dos slots `player1Id`/`player2Id` do time e do
 *  `player1Id` legado da inscrição. Sem isso o trio+ sumiria do roster. */
export function inscriptionMemberUids(input: { inscription: Record<string, unknown>; team: Record<string, unknown> | null }): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (raw: unknown): void => {
    const id = trimmedStr(raw);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  const addAll = (raw: unknown): void => {
    if (!Array.isArray(raw)) return;
    for (const item of raw) add(item);
  };

  addAll(input.inscription['participantUids']);
  if (input.team) {
    add(input.team['player1Id']);
    add(input.team['player2Id']);
    addAll(input.team['memberUids']);
  }
  add(input.inscription['player1Id']);
  return ordered;
}

/** Até duas palavras do nome — "Ana Paula Silva" → "Ana Paula". Na lista o sobrenome completo
 *  estoura a linha; duas palavras bastam pra reconhecer o atleta sem truncar no meio da palavra. */
export function enrolledAthleteDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return UNKNOWN_ATHLETE;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function memberFromProfile(uid: string, profile: RosterProfile | undefined): EnrolledTeamMember {
  const label = profile ? profile.displayName.trim() : '';
  if (!label) return { uid, name: UNKNOWN_ATHLETE, initials: '?', photoUrl: profile?.avatarUrl ?? null };
  return {
    uid,
    name: enrolledAthleteDisplayName(label),
    initials: initialsOf(label),
    photoUrl: profile?.avatarUrl ?? null,
  };
}

/** Nome da equipe: o nome real do doc, senão "Nome1 / Nome2 / …". */
export function enrolledTeamDisplayName(input: {
  inscription: Record<string, unknown>;
  team: Record<string, unknown> | null;
  members: readonly EnrolledTeamMember[];
}): string {
  for (const key of ['customTeamName', 'teamName', 'name'] as const) {
    const raw = trimmedStr(input.inscription[key]) || trimmedStr(input.team?.[key]);
    if (raw) return raw;
  }
  const names = input.members.map((m) => m.name.trim()).filter((n) => n && n !== UNKNOWN_ATHLETE);
  return names.length > 0 ? names.join(' / ') : 'Equipe';
}

/** Uma linha por inscrição confirmada (a vaga É a equipe), ordenada por categoria e nome. */
export function buildEnrolledTeams(input: {
  rows: readonly RosterRow[];
  profiles: ReadonlyMap<string, RosterProfile>;
  categories: readonly RosterCategory[];
}): EnrolledTeam[] {
  const categoryNameById = new Map<string, string>();
  for (const c of input.categories) {
    const id = c.id.trim();
    if (!id) continue;
    categoryNameById.set(id, c.categoryName.trim() || id);
  }

  const teams: EnrolledTeam[] = [];
  for (const row of input.rows) {
    if (!isConfirmedInscription(row.inscription)) continue;
    const categoryId = trimmedStr(row.inscription['categoryId']);
    if (!categoryId) continue;

    const memberUids = inscriptionMemberUids({ inscription: row.inscription, team: row.team });
    if (memberUids.length === 0) continue;

    const members = memberUids.map((uid) => memberFromProfile(uid, input.profiles.get(uid)));

    teams.push({
      registrationId: row.registrationId,
      teamId: trimmedStr(row.inscription['teamId']) || trimmedStr(row.team?.['id']),
      displayName: enrolledTeamDisplayName({ inscription: row.inscription, team: row.team, members }),
      members,
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? categoryId,
    });
  }

  teams.sort((a, b) => {
    const byCategory = a.categoryName.toLowerCase().localeCompare(b.categoryName.toLowerCase());
    if (byCategory !== 0) return byCategory;
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });
  return teams;
}

/** Filtra pela categoria (`null`/vazio = todas). */
export function filterEnrolledTeamsByCategory(teams: readonly EnrolledTeam[], categoryId: string | null): EnrolledTeam[] {
  const id = categoryId?.trim() ?? '';
  if (!id) return [...teams];
  return teams.filter((t) => t.categoryId === id);
}

/** Agrupa por categoria, na ordem já ordenada da lista. */
export function groupEnrolledTeamsByCategory(teams: readonly EnrolledTeam[]): EnrolledTeamGroup[] {
  const groups: EnrolledTeamGroup[] = [];
  for (const team of teams) {
    const last = groups[groups.length - 1];
    if (last && last.categoryId === team.categoryId) {
      last.teams.push(team);
      continue;
    }
    groups.push({ categoryId: team.categoryId, categoryName: team.categoryName, teams: [team] });
  }
  return groups;
}
