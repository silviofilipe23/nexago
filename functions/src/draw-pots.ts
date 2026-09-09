import {levelRank} from "./category-level-eligibility";

/**
 * Força declarada da dupla e potes por ranking do sorteio ao vivo.
 *
 * GÊMEO DE `frontend/.../painel/data/team-level-score.ts`. O portal precisa da
 * regra pra sugerir cabeças de chave; o servidor precisa dela pra montar os
 * potes sem confiar no cliente. Não há pacote compartilhado entre `functions/`
 * e `frontend/`, então a duplicação é deliberada — e `draw-pots.test.ts` roda a
 * mesma tabela de casos do spec do portal pra que uma não ande sem a outra.
 */

/** Pontos por degrau da escada de 7 (rank 0–6 → 1–7). */
const POINTS_BY_RANK: Record<number, number> = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7};

/** Abaixo disso o rating ainda consolida — mesmo piso de `ladder.minRatedMatches`. */
const MIN_RATED_MATCHES = 10;

/** Níveis declarados do atleta, como vêm do espelho `public_profiles`/`users`. */
export interface AthleteLevelSource {
  /** `sportOnboarding.levelsBySport` — fonte canônica, por código de esporte. */
  levelsBySport: Record<string, string>;
  /** `level`/`nivel` — nível global de docs antigos, usado quando falta o do esporte. */
  legacyLevel: string | null;
}

export interface AthleteRatingLite {
  rating: number;
  ratedMatches: number;
}

export interface TeamStrength {
  /** Soma dos degraus (2–14 numa dupla); `null` se algum atleta não tem nível. */
  points: number | null;
  /** Rating composto, ou `null` sem dado suficiente. Só desempata. */
  rating: number | null;
}

/** Dupla já pontuada, pronta pra ordenar. */
export interface DrawTeamStrength extends TeamStrength {
  teamId: string;
}

export interface DrawPot {
  /** 1-based — é o número que vai ao ar ("Pote 2"). */
  index: number;
  teamIds: string[];
}

/** Nível declarado do atleta pro esporte do torneio, caindo no global legado. */
function levelCodeFor(source: AthleteLevelSource, sportCode: string | null): string | null {
  const bySport = sportCode ? source.levelsBySport[sportCode]?.trim() : "";
  if (bySport) return bySport;
  return source.legacyLevel?.trim() || null;
}

/** Média simples dos individuais — mesma convenção de "jogador composto" do Glicko. */
export function compositeTeamRating(
  ratings: readonly (AthleteRatingLite | null | undefined)[],
): number | null {
  if (ratings.length === 0) return null;
  let sum = 0;
  for (const r of ratings) {
    if (!r || r.ratedMatches < MIN_RATED_MATCHES) return null;
    sum += r.rating;
  }
  return sum / ratings.length;
}

/** Pontuação da dupla a partir dos perfis (1 no solo, 2 na dupla). */
export function teamStrength(
  members: readonly AthleteLevelSource[],
  sportCode: string | null,
  ratings: readonly (AthleteRatingLite | null | undefined)[] = [],
): TeamStrength {
  const points = members.map((m) => {
    const rank = levelRank(levelCodeFor(m, sportCode));
    return rank == null ? null : POINTS_BY_RANK[rank] ?? null;
  });
  const complete = points.length > 0 && points.every((p) => p != null);
  return {
    points: complete ? points.reduce((sum: number, p) => sum + (p ?? 0), 0) : null,
    rating: compositeTeamRating(ratings),
  };
}

/**
 * Ordem decrescente de força: pontos, rating como desempate, duplas sem nível
 * por último — e `teamId` como último critério, para a ordenação ser
 * REPRODUZÍVEL. Sem esse último degrau, recriar a sessão com os mesmos dados
 * poderia gerar potes diferentes (a ordem de leitura do Firestore não é
 * estável), e o comprovante deixaria de conferir.
 */
export function rankTeamsByStrength(teams: readonly DrawTeamStrength[]): string[] {
  return [...teams]
    .sort((a, b) => {
      if (a.points !== b.points) {
        if (a.points == null) return 1;
        if (b.points == null) return -1;
        return b.points - a.points;
      }
      if (a.rating !== b.rating) {
        if (a.rating == null) return 1;
        if (b.rating == null) return -1;
        return b.rating - a.rating;
      }
      return a.teamId.localeCompare(b.teamId);
    })
    .map((t) => t.teamId);
}

/**
 * Potes por ranking: fatias de `groupCount` na ordem de força. O pote 1 são as
 * cabeças. O último pote fica CURTO quando a divisão não fecha (14 duplas em 4
 * grupos → 4/4/4/2) — redistribuir bagunçaria a faixa de nível de cada pote,
 * que é justamente o que o pote existe pra preservar.
 */
export function buildGroupPots(rankedTeamIds: readonly string[], groupCount: number): DrawPot[] {
  const size = Math.max(1, Math.floor(groupCount) || rankedTeamIds.length || 1);
  const pots: DrawPot[] = [];
  for (let i = 0; i < rankedTeamIds.length; i += size) {
    pots.push({index: pots.length + 1, teamIds: rankedTeamIds.slice(i, i + size)});
  }
  return pots;
}
