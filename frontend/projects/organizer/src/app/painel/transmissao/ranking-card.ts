import type { RankingAthlete, RankingCard, RankingKind } from '../data/broadcast-ranking';

/** Monta o card "Ranking Geral Top 10" da transmissão (contrato em `broadcast-ranking.ts`).
 *  Função pura: quem chama entrega as entradas JÁ recortadas por gênero e os perfis. Pontos ganhos
 *  na etapa = soma de `results[]` do torneio; total ANTES = total atual − ganho; a posição antes
 *  reordena o MESMO conjunto pelos pontos antes. Empate: desempate estável por id.
 *  Serve aos dois tipos: `atleta` (a entidade é o próprio atleta) e `dupla` (a entidade é o time;
 *  `teams` diz quais atletas o formam e nome/foto/cidade vêm do 1º ao 2º atleta). */

export interface RankingCardProfile {
  name: string;
  photoUrl: string | null;
  city: string | null;
  state: string | null;
}

export interface RankingCardSource {
  kind: RankingKind;
  /** `id` = uid do atleta (kind atleta) ou id do time (kind dupla). */
  entries: readonly { id: string; totalPoints: number; results: readonly { tournamentId: string; points: number }[] }[];
  /** Só dupla: id do time → uids dos atletas, na ordem de exibição. */
  teams?: ReadonlyMap<string, readonly string[]>;
  tournamentId: string;
  tournamentName: string;
  categoryLabel: string;
  /** Perfis por uid de atleta. */
  profiles: ReadonlyMap<string, RankingCardProfile>;
  /** O ranking já reflete a etapa (torneio concluído). */
  updated: boolean;
}

const TOP = 10;

interface Row {
  id: string;
  ptsBefore: number;
  ptsAfter: number;
  gain: number | null;
  posBefore: number | null;
  posAfter: number;
}

function ranked(rows: readonly Row[], pts: (r: Row) => number): Row[] {
  return rows.filter((r) => pts(r) > 0).sort((a, b) => pts(b) - pts(a) || a.id.localeCompare(b.id));
}

export function rankingCardOf(src: RankingCardSource, key: string): RankingCard | null {
  const base = src.entries.map((e) => {
    const mine = e.results.filter((r) => r.tournamentId === src.tournamentId);
    const gain = mine.length > 0 ? mine.reduce((s, r) => s + r.points, 0) : null;
    return { id: e.id, ptsAfter: e.totalPoints, gain, ptsBefore: e.totalPoints - (gain ?? 0) };
  });
  const rows: Row[] = base.map((b) => ({ ...b, posBefore: null, posAfter: 0 }));
  ranked(rows, (r) => r.ptsBefore).forEach((r, i) => (r.posBefore = i + 1));
  const after = ranked(rows, (r) => r.ptsAfter);
  after.forEach((r, i) => (r.posAfter = i + 1));
  if (after.length === 0) return null;

  const dupla = src.kind === 'dupla';
  const display = (id: string) => {
    const members = dupla ? [...(src.teams?.get(id) ?? [])].slice(0, 2) : [id];
    const ps = members.map((m) => src.profiles.get(m));
    const names = ps.map((p) => p?.name ?? 'Atleta');
    const photos = ps.map((p) => p?.photoUrl ?? null);
    const place = ps.find((p) => p?.city);
    const sub = place?.city ? (place.state ? `${place.city}/${place.state}` : place.city) : null;
    return {
      name: dupla ? (names.length > 0 ? names.join(' / ') : 'Dupla') : (names[0] ?? 'Atleta'),
      photo: photos[0] ?? null,
      names: dupla ? names : [],
      photos: dupla ? photos : [],
      sub,
    };
  };
  const athleteOf = (r: Row, pos: number, fromBefore: boolean): RankingAthlete => ({
    id: r.id,
    ...display(r.id),
    posBefore: r.posBefore,
    posAfter: fromBefore ? r.posAfter || pos : pos,
    ptsBefore: r.ptsBefore,
    ptsAfter: r.ptsAfter,
    gain: r.gain,
  });
  // Quem saiu do ranking depois (pontos ≤ 0) não existe aqui; posAfter dele cai na própria posição.
  const beforeList = ranked(rows, (r) => r.ptsBefore).slice(0, TOP).map((r, i) => athleteOf(r, i + 1, true));
  const afterList = after.slice(0, TOP).map((r, i) => athleteOf(r, i + 1, false));

  const profileOf = (id: string) => {
    const d = display(id);
    return { name: d.name, photo: d.photo, photos: d.photos };
  };
  const top = afterList[0]!;
  const leader = { name: top.name, photo: top.photo, photos: top.photos, points: top.ptsAfter, keeps: top.posBefore === 1 };

  let climber: RankingCard['climber'] = null;
  let best = 0;
  for (const a of afterList) {
    if (a.posBefore == null) continue;
    const up = a.posBefore - a.posAfter;
    if (up > best) {
      best = up;
      climber = { ...profileOf(a.id), from: a.posBefore, to: a.posAfter };
    }
  }

  let topGain: RankingCard['topGain'] = null;
  let bestGain = 0;
  for (const a of afterList) {
    if (a.gain != null && a.gain > bestGain) {
      bestGain = a.gain;
      topGain = { ...profileOf(a.id), sub: a.sub, gain: a.gain };
    }
  }

  return {
    kind: src.kind,
    key,
    categoryLabel: src.categoryLabel,
    stageName: src.tournamentName,
    updated: src.updated,
    before: beforeList.length > 0 ? beforeList : afterList,
    after: afterList,
    leader,
    climber,
    topGain,
  };
}
