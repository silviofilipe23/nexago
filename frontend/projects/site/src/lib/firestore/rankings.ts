import { collection, documentId, getDocs, query, where, type DocumentData } from 'firebase/firestore/lite';
import { sportProfileCode } from '@nexago/sports';
import { app } from '../firebase-app';
import { liteDb } from '../firebase-lite';

/**
 * Top N do ranking por esporte para o bloco "Ranking" do blog. Espelha o app
 * (`nexago_app/lib/features/ranking/data/ranking_repository.dart` + `domain/ranking_logic.dart` +
 * `domain/ranking_list_mapper.dart`):
 *
 * - Lê `artifacts/{projectId}/public/data/athleteRankingsBySport` (ou `teamRankingsBySport`) com
 *   `sport == <código de perfil>` — a coleção inteira do esporte, como o app.
 * - Temporada = `pointsByYear[ano]`; quem não pontuou no ano fica fora; ordena por pontos.
 * - Gênero: do perfil do atleta (`public_profiles/{uid}.gender`, o espelho público de `users` que o
 *   app também lê) ou do doc da equipe (`artifacts/.../teams/{id}.gender`), normalizado como
 *   `normalizeRankingGender`; as posições são renumeradas DEPOIS do filtro.
 *
 * Custo: o app lê o perfil de TODOS os ranqueados para filtrar. Aqui, com filtro de gênero, os
 * perfis (ou equipes) são lidos em ordem de pontos, em lotes de {@link SCAN_BATCH}, parando ao
 * achar N — com teto de {@link SCAN_CAP} candidatos. As posições continuam exatas (são a ordem
 * dentro do filtro); só que, se o teto for atingido antes de N, o bloco mostra menos linhas.
 * Sem filtro ("all"), só os N primeiros são lidos (para nome e foto).
 */

export type RankingMode = 'athletes' | 'teams';
export type RankingGender = 'all' | 'masculino' | 'feminino' | 'misto';
type EntityGender = Exclude<RankingGender, 'all'>;

export const SCAN_BATCH = 15;
export const SCAN_CAP = 60;

export interface RankingCandidate {
  id: string;
  points: number;
}

export interface RankingAvatar {
  initials: string;
  photoUrl: string | null;
}

export interface RankingTopRow {
  rank: number;
  id: string;
  name: string;
  points: number;
  /** 1 rosto para atleta; até 2 (player1/player2) para equipe. */
  avatars: RankingAvatar[];
}

// ---------------------------------------------------------------------------------------------
// Puro (testado)

/** Ano corrente no fuso de São Paulo — a "temporada atual" do app. */
export function seasonYear(now: Date = new Date()): number {
  const y = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(now);
  return Number(y);
}

/** Dono do doc por esporte: o CAMPO; sem ele, o id do doc sem o sufixo `_{CODE}`. */
export function rankingOwnerId(docId: string, data: DocumentData, idField: 'athleteId' | 'teamId', code: string): string {
  const fromField = typeof data[idField] === 'string' ? data[idField].trim() : '';
  if (fromField) return fromField;
  const suffix = `_${code}`;
  return docId.endsWith(suffix) ? docId.slice(0, -suffix.length) : docId;
}

/** Pontos da temporada de um doc por esporte (`pointsByYear[ano]`, arredondado como o app). */
export function seasonPoints(data: DocumentData, year: number): number {
  const byYear = data['pointsByYear'];
  if (!byYear || typeof byYear !== 'object') return 0;
  const raw = (byYear as Record<string, unknown>)[String(year)];
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
}

/** Quem pontuou na temporada, mais pontos primeiro (empate: id, para a ordem não oscilar). */
export function seasonCandidates(entries: RankingCandidate[]): RankingCandidate[] {
  return entries
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `normalizeRankingGender` do app. */
export function normalizeRankingGender(raw: unknown): EntityGender | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const n = raw.trim().toLowerCase();
  if (n.startsWith('masc') || n === 'm' || n === 'male') return 'masculino';
  if (n.startsWith('fem') || n === 'f' || n === 'female') return 'feminino';
  if (n.startsWith('mix') || n === 'misto' || n === 'x') return 'misto';
  return null;
}

/**
 * Os `limit` primeiros que passam no filtro de gênero, com a posição renumerada. Lê os metadados
 * (perfil/equipe) em lotes, na ordem do ranking, e para assim que completa. Devolve também os
 * metadados lidos, para quem chama montar nome e foto sem reler.
 */
export async function selectTop<M>(
  candidates: RankingCandidate[],
  gender: RankingGender,
  loadMeta: (ids: string[]) => Promise<Map<string, M>>,
  genderOf: (meta: M | undefined) => EntityGender | null,
  opts: { limit?: number; batch?: number; cap?: number } = {},
): Promise<{ rows: { rank: number; id: string; points: number }[]; meta: Map<string, M> }> {
  const limit = opts.limit ?? 5;
  const meta = new Map<string, M>();

  if (gender === 'all') {
    const top = candidates.slice(0, limit);
    if (top.length > 0) for (const [k, v] of await loadMeta(top.map((c) => c.id))) meta.set(k, v);
    return { rows: top.map((c, i) => ({ rank: i + 1, ...c })), meta };
  }

  const batch = opts.batch ?? SCAN_BATCH;
  const pool = candidates.slice(0, opts.cap ?? SCAN_CAP);
  const picked: RankingCandidate[] = [];
  for (let i = 0; i < pool.length && picked.length < limit; i += batch) {
    const chunk = pool.slice(i, i + batch);
    const loaded = await loadMeta(chunk.map((c) => c.id));
    for (const [k, v] of loaded) meta.set(k, v);
    for (const c of chunk) {
      if (picked.length >= limit) break;
      if (genderOf(meta.get(c.id)) === gender) picked.push(c);
    }
  }
  return { rows: picked.map((c, i) => ({ rank: i + 1, ...c })), meta };
}

/** Parece um uid do Firestore (nome "vazio" gravado como id): `looksLikeFirestoreUid` do app. */
function looksLikeUid(value: string): boolean {
  return value.length >= 20 && value.length <= 128 && /^[A-Za-z0-9]+$/.test(value);
}

function graphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(value)].map((s) => s.segment);
  }
  return Array.from(value);
}

function firstUpper(value: string, count: number): string {
  return graphemes(value).slice(0, count).join('').toUpperCase();
}

export interface PublicProfileLite {
  nickname: string | null;
  fullName: string | null;
  photoUrl: string | null;
  gender: EntityGender | null;
}

export function mapPublicProfile(d: DocumentData): PublicProfileLite {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const photo = str(d['profilePhotoUrl']) ?? str(d['avatarUrl']) ?? str(d['photoURL']);
  return {
    nickname: str(d['nickname']),
    fullName: str(d['fullName']) ?? str(d['name']),
    photoUrl: photo && /^https:\/\//i.test(photo) ? photo : null,
    gender: normalizeRankingGender(d['gender']),
  };
}

/** `resolveAppUserDisplayName` (sem o e-mail, que o espelho público não tem). '' sem nome legível. */
export function profileDisplayName(p: PublicProfileLite | undefined): string {
  const nick = p?.nickname?.replace(/^@/, '').trim() ?? '';
  if (nick && !looksLikeUid(nick)) return nick;
  const full = p?.fullName ?? '';
  return full && !looksLikeUid(full) ? full : '';
}

/** `rankingDisplayName`: nome, senão "Atleta <6 primeiros do id>". */
export function athleteName(p: PublicProfileLite | undefined, id: string): string {
  return profileDisplayName(p) || (id.length >= 6 ? `Atleta ${id.slice(0, 6)}` : 'Atleta');
}

/** `rankingInitials`/`initialsFromDisplayName`. */
export function initialsFor(p: PublicProfileLite | undefined, id: string): string {
  const parts = profileDisplayName(p).split(/\s+/).filter(Boolean);
  if (parts.length === 1) return firstUpper(parts[0], 2);
  if (parts.length > 1) return firstUpper(parts[0], 1) + firstUpper(parts[parts.length - 1], 1);
  return id.length >= 2 ? id.slice(0, 2).toUpperCase() : 'AT';
}

/** `shortPersonLabel`: "Ana Silva" → "Ana S.". */
function shortLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${firstUpper(parts[parts.length - 1], 1)}.`;
}

export interface TeamLite {
  teamName: string | null;
  gender: EntityGender | null;
  player1Id: string | null;
  player2Id: string | null;
}

export function mapTeam(d: DocumentData): TeamLite {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const members = Array.isArray(d['memberUids']) ? d['memberUids'].map(str).filter((v): v is string => !!v) : [];
  // O app desenha os rostos de player1/player2 (equipes nomeadas espelham ali os 2 primeiros do
  // elenco); `memberUids` só cobre doc sem esses campos.
  return {
    teamName: str(d['teamName']),
    gender: normalizeRankingGender(d['gender']),
    player1Id: str(d['player1Id']) ?? members[0] ?? null,
    player2Id: str(d['player2Id']) ?? members[1] ?? null,
  };
}

/** `teamDisplayName` do app. */
export function teamName(team: TeamLite | undefined, p1: PublicProfileLite | undefined, p2: PublicProfileLite | undefined): string {
  if (team?.teamName) return team.teamName;
  const n1 = team?.player1Id ? profileDisplayName(p1) : '';
  const n2 = team?.player2Id ? profileDisplayName(p2) : '';
  const s1 = shortLabel(n1);
  const s2 = shortLabel(n2);
  if (s1 && s2 && s1 !== s2) return `${s1} / ${s2}`;
  if (n1 && n2 && n1 !== n2) return `${n1} / ${n2}`;
  return n1 || n2 || 'Dupla';
}

// ---------------------------------------------------------------------------------------------
// Leitura

const BASE = ['artifacts', app.options.projectId ?? '', 'public', 'data'] as const;
const IN_MAX = 30; // teto do operador `in` do Firestore

async function loadByIds<M>(path: readonly string[], ids: string[], map: (d: DocumentData) => M): Promise<Map<string, M>> {
  const out = new Map<string, M>();
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_MAX) chunks.push(unique.slice(i, i + IN_MAX));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(liteDb, path[0], ...path.slice(1)), where(documentId(), 'in', chunk))),
    ),
  );
  for (const snap of snaps) for (const d of snap.docs) out.set(d.id, map(d.data()));
  return out;
}

const loadProfiles = (ids: string[]) => loadByIds(['public_profiles'], ids, mapPublicProfile);
const loadTeams = (ids: string[]) => loadByIds([...BASE, 'teams'], ids, mapTeam);

async function loadCandidates(mode: RankingMode, code: string, year: number): Promise<RankingCandidate[]> {
  const name = mode === 'athletes' ? 'athleteRankingsBySport' : 'teamRankingsBySport';
  const idField = mode === 'athletes' ? 'athleteId' : 'teamId';
  const snap = await getDocs(query(collection(liteDb, ...BASE, name), where('sport', '==', code)));
  return seasonCandidates(
    snap.docs.map((d) => ({ id: rankingOwnerId(d.id, d.data(), idField, code), points: seasonPoints(d.data(), year) })),
  );
}

/**
 * Top N da temporada atual do esporte (`sport` = `code` do catálogo). Vazio se o esporte for
 * desconhecido, se ninguém pontuou, ou se a leitura falhar (o bloco some).
 */
export async function getRankingTop(
  sport: string,
  mode: RankingMode,
  gender: RankingGender,
  limit = 5,
): Promise<RankingTopRow[]> {
  const code = sportProfileCode(sport);
  if (!code) return [];
  try {
    const candidates = await loadCandidates(mode, code, seasonYear());
    if (candidates.length === 0) return [];

    if (mode === 'athletes') {
      const { rows, meta } = await selectTop(candidates, gender, loadProfiles, (p) => p?.gender ?? null, { limit });
      return rows.map((r) => {
        const p = meta.get(r.id);
        return { ...r, name: athleteName(p, r.id), avatars: [{ initials: initialsFor(p, r.id), photoUrl: p?.photoUrl ?? null }] };
      });
    }

    const { rows, meta: teams } = await selectTop(candidates, gender, loadTeams, (t) => t?.gender ?? null, { limit });
    const playerIds = rows.flatMap((r) => [teams.get(r.id)?.player1Id, teams.get(r.id)?.player2Id]).filter((v): v is string => !!v);
    const profiles = playerIds.length ? await loadProfiles(playerIds) : new Map<string, PublicProfileLite>();
    return rows.map((r) => {
      const t = teams.get(r.id);
      const p1 = t?.player1Id ? profiles.get(t.player1Id) : undefined;
      const p2 = t?.player2Id ? profiles.get(t.player2Id) : undefined;
      const avatars: RankingAvatar[] = [];
      if (t?.player1Id) avatars.push({ initials: initialsFor(p1, t.player1Id), photoUrl: p1?.photoUrl ?? null });
      if (t?.player2Id && t.player2Id !== t.player1Id) avatars.push({ initials: initialsFor(p2, t.player2Id), photoUrl: p2?.photoUrl ?? null });
      if (avatars.length === 0) avatars.push({ initials: initialsFor(undefined, r.id), photoUrl: null });
      return { ...r, name: teamName(t, p1, p2), avatars };
    });
  } catch (err) {
    console.error('[rankings] getRankingTop failed:', err);
    return [];
  }
}
