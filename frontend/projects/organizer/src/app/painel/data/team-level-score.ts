import { levelDisplayLabel, levelRankOf } from '@nexago/levels';

/**
 * Pontuação de nível de uma dupla — leitura rápida da força declarada de cada inscrição,
 * usada pelo organizador pra decidir cabeças de chave.
 *
 * Base: o nível declarado no perfil (`sportOnboarding.levelsBySport[sportCode]`, com fallback
 * nos campos globais legados), que existe pra todo atleta e todo esporte. O rating técnico
 * (Glicko-2, `athleteRatings/{uid}_{sportCode}`) entra só como refinamento/desempate, e apenas
 * quando o esporte tem engine de rating e nenhum dos atletas está provisional — mesma regra
 * dura do app (`match_win_probability_providers.dart`): nada de mostrar número com dado fraco.
 */

/** Degrau na escada (1 = Iniciante 1 … 7 = Open), ranks 0–6 contíguos. */
const POINTS_BY_RANK: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };

/** Abaixo disso o rating ainda está consolidando — espelha `AthleteRating.isProvisional`
 *  (Flutter) e `ladder.minRatedMatches` (backend). */
const MIN_RATED_MATCHES = 10;

/** Níveis declarados de um atleta, como vêm do espelho `public_profiles`. */
export interface AthleteLevelSource {
  /** `sportOnboarding.levelsBySport` — fonte canônica, por código de esporte. */
  levelsBySport: Record<string, string>;
  /** `level`/`nivel` — nível global de docs antigos, usado quando falta o do esporte. */
  legacyLevel: string | null;
}

/** Rating técnico do atleta no esporte (subconjunto de `athleteRatings`). */
export interface AthleteRatingLite {
  rating: number;
  ratedMatches: number;
}

export interface TeamLevelMember {
  /** Rótulo de exibição do nível (`Open`, `Intermediário 2`…) ou `''` quando não informado. */
  label: string;
  points: number | null;
}

export interface TeamLevelScore {
  /** Soma dos pontos dos atletas (2–14 numa dupla); `null` se algum não tem nível. */
  points: number | null;
  members: TeamLevelMember[];
  /** Rating composto da dupla, ou `null` quando não há dado suficiente. */
  rating: number | null;
}

/** Nível declarado do atleta pro esporte do torneio, caindo no global legado. */
export function levelCodeFor(source: AthleteLevelSource, sportCode: string | null): string | null {
  const bySport = sportCode ? source.levelsBySport[sportCode]?.trim() : '';
  if (bySport) return bySport;
  return source.legacyLevel?.trim() || null;
}

/** Pontos (1–7) do nível, ou `null` quando ausente/desconhecido. */
export function levelPointsOf(raw: string | null | undefined): number | null {
  const rank = levelRankOf(raw);
  if (rank == null) return null;
  return POINTS_BY_RANK[rank] ?? null;
}

/** Rótulo curto pra caber na linha da lista (`Intermediário 1` → `Interm. 1`). */
export function shortLevelLabel(raw: string | null | undefined): string {
  return levelDisplayLabel(raw).replace('Intermediário', 'Interm.');
}

/** Rating composto da dupla: média simples dos individuais — mesma convenção de "jogador
 *  composto" do backend (`compositeTeamRating` em `functions/src/glicko.ts`). `null` se algum
 *  atleta não tem rating ou ainda está provisional. */
export function compositeTeamRating(ratings: readonly (AthleteRatingLite | null | undefined)[]): number | null {
  if (ratings.length === 0) return null;
  let sum = 0;
  for (const r of ratings) {
    if (!r || r.ratedMatches < MIN_RATED_MATCHES) return null;
    sum += r.rating;
  }
  return sum / ratings.length;
}

/** Pontuação da dupla a partir dos perfis dos atletas (1 no solo, 2 na dupla). */
export function teamLevelScore(
  members: readonly AthleteLevelSource[],
  sportCode: string | null,
  ratings: readonly (AthleteRatingLite | null | undefined)[] = [],
): TeamLevelScore {
  const scored: TeamLevelMember[] = members.map((m) => {
    const code = levelCodeFor(m, sportCode);
    return { label: shortLevelLabel(code), points: levelPointsOf(code) };
  });
  const complete = scored.length > 0 && scored.every((m) => m.points != null);
  return {
    points: complete ? scored.reduce((sum, m) => sum + (m.points ?? 0), 0) : null,
    members: scored,
    rating: compositeTeamRating(ratings),
  };
}

/** Ordem decrescente de força: pontos, depois rating (desempate), duplas sem nível por último. */
export function compareTeamLevelDesc(a: TeamLevelScore, b: TeamLevelScore): number {
  const pa = a.points;
  const pb = b.points;
  if (pa !== pb) {
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pb - pa;
  }
  const ra = a.rating;
  const rb = b.rating;
  if (ra == null && rb == null) return 0;
  if (ra == null) return 1;
  if (rb == null) return -1;
  return rb - ra;
}

/** Texto do selo: `9 pts` (com o rating anexado quando existe). */
export function teamScoreLabel(score: TeamLevelScore): string {
  const base = score.points == null ? '—' : `${score.points} pts`;
  return score.rating == null ? base : `${base} · ${Math.round(score.rating)}`;
}

/** Composição por extenso pra linha de apoio: `Open + Interm. 2`. */
export function teamLevelsSummary(score: TeamLevelScore): string {
  const labels = score.members.map((m) => m.label).filter((l) => l.length > 0);
  if (labels.length === 0) return 'Nível não informado';
  return labels.join(' + ');
}
