/**
 * NexaSquad na página pública (`/squad`): tipos, rótulos e a lógica de filtro/ordem — puro, sem
 * Firebase (o repositório fica em `firestore/squad.ts`).
 *
 * A fonte é o espelho `squadPublic/{uid}`, escrito só pelos gatilhos de
 * `functions/src/squad-public-sync.ts`: só embaixador com contrato ativo, só dados esportivos e
 * o código. Nada de comissão, % de desconto, Score ou ranking interno.
 */

export type SquadTier = 'ath' | 'amb' | 'pro' | 'cap';

export interface SquadAmbassador {
  id: string;
  name: string;
  photoUrl: string | null;
  tier: SquadTier;
  code: string;
  city: string | null;
  state: string | null;
  arenaName: string | null;
  sport: string | null;
  elo: string | null;
  eloIndex: number | null;
  tournaments: number | null;
}

/** Portal do atleta: o `?squad=CODIGO` é o que a atribuição já entende (`squad-link.ts` do portal). */
export const ATHLETE_PORTAL_URL = 'https://atleta.nexago.com.br';
/** "Entrar no Squad" do portal do atleta (tela 04 da seção Portal). */
export const SQUAD_JOIN_URL = `${ATHLETE_PORTAL_URL}/squad`;

export function squadCodeLink(code: string): string {
  return `${ATHLETE_PORTAL_URL}/?squad=${encodeURIComponent(code)}`;
}

export interface TierMeta {
  label: string;
  /** Plural do título da seção. */
  plural: string;
  /** Cor do nível (classe utilitária de fundo, token semântico). */
  bg: string;
  dot: string;
}

/** Ordem de exibição: Pro primeiro, Athlete por último. */
export const TIER_ORDER: readonly SquadTier[] = ['pro', 'cap', 'amb', 'ath'];

export const TIER_META: Record<SquadTier, TierMeta> = {
  pro: { label: 'Pro Ambassador', plural: 'Pro Ambassadors', bg: 'bg-brand', dot: 'bg-brand' },
  cap: { label: 'Captain', plural: 'Captains', bg: 'bg-pending', dot: 'bg-pending' },
  amb: { label: 'Ambassador', plural: 'Ambassadors', bg: 'bg-brand-light', dot: 'bg-brand-light' },
  ath: { label: 'Athlete', plural: 'Athletes', bg: 'bg-text-mute', dot: 'bg-text-mute' },
};

const TIERS = new Set<string>(TIER_ORDER);
const CODE_RE = /^[A-Z0-9]{4,12}$/;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Doc do espelho → embaixador. Doc fora do contrato (sem nome, nível ou código) é descartado. */
export function mapSquadAmbassador(id: string, d: Record<string, unknown>): SquadAmbassador | null {
  const name = str(d['name']);
  const code = str(d['code']);
  const tier = d['tier'];
  if (!name || !code || !CODE_RE.test(code) || typeof tier !== 'string' || !TIERS.has(tier)) return null;
  const photo = str(d['photoUrl']);
  const eloIndex = d['eloIndex'];
  const tournaments = d['tournaments'];
  return {
    id,
    name,
    photoUrl: photo && /^https?:\/\//i.test(photo) ? photo : null,
    tier: tier as SquadTier,
    code,
    city: str(d['city']),
    state: str(d['state']),
    arenaName: str(d['arenaName']),
    sport: str(d['sport']),
    elo: str(d['elo']),
    eloIndex: typeof eloIndex === 'number' && Number.isInteger(eloIndex) ? eloIndex : null,
    tournaments: typeof tournaments === 'number' && Number.isInteger(tournaments) && tournaments >= 0 ? tournaments : null,
  };
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Nível (Pro → Athlete), depois Elo, torneios e nome. */
export function sortAmbassadors(list: readonly SquadAmbassador[]): SquadAmbassador[] {
  const rank = (t: SquadTier) => TIER_ORDER.indexOf(t);
  return [...list].sort(
    (a, b) =>
      rank(a.tier) - rank(b.tier) ||
      (b.eloIndex ?? -1) - (a.eloIndex ?? -1) ||
      (b.tournaments ?? -1) - (a.tournaments ?? -1) ||
      collator.compare(a.name, b.name),
  );
}

/** Minúsculas e sem acento: "Goiânia" casa com "goiania". */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export interface SquadFilter {
  tier: SquadTier | 'all';
  city: string | null;
  query: string;
}

export function matchesFilter(a: SquadAmbassador, f: SquadFilter): boolean {
  if (f.tier !== 'all' && a.tier !== f.tier) return false;
  if (f.city && a.city !== f.city) return false;
  const q = fold(f.query);
  if (!q) return true;
  return [a.name, a.arenaName, a.city, a.code].some((v) => v != null && fold(v).includes(q));
}

export function tierCounts(list: readonly SquadAmbassador[]): Record<SquadTier | 'all', number> {
  const out: Record<SquadTier | 'all', number> = { all: list.length, pro: 0, cap: 0, amb: 0, ath: 0 };
  for (const a of list) out[a.tier]++;
  return out;
}

/** Cidades presentes, da mais representada para a menos (empate: alfabética). */
export function citiesByCount(list: readonly SquadAmbassador[]): string[] {
  const counts = new Map<string, number>();
  for (const a of list) if (a.city) counts.set(a.city, (counts.get(a.city) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])).map(([c]) => c);
}

/** Arenas distintas pelo nome (sem acento/caixa), para o número do topo. */
export function arenaCount(list: readonly SquadAmbassador[]): number {
  return new Set(list.map((a) => a.arenaName).filter((n): n is string => !!n).map(fold)).size;
}

/** "Goiânia, Brasília e região" — as duas cidades com mais embaixadores. */
export function regionLabel(list: readonly SquadAmbassador[]): string {
  const [first, second] = citiesByCount(list);
  if (!first) return '';
  return second ? `${first}, ${second} e região` : `${first} e região`;
}

/** "Goiânia · Arena CFC"; sem cidade cai para a UF. */
export function placeLabel(a: SquadAmbassador): string {
  return [a.city ?? a.state, a.arenaName].filter(Boolean).join(' · ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Matiz estável por embaixador para o fundo sem foto (0–359). */
export function hueFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
