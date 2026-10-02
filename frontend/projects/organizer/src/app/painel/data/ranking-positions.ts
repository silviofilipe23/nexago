/** Posição no ranking geral do nexaGO (`athleteRankings`/`teamRankings`) — a mesma que o
 *  atleta vê na tela Ranking. Porte da regra de `rankParticipants`
 *  (`projects/athlete/src/app/ranking/athlete-ranking.selectors.ts`): esporte, gênero e
 *  formato definem QUAL ranking; dentro dele, ordem por pontos. Mudou lá, muda aqui. */

export type RankingGender = 'male' | 'female' | 'mixed';
export type TeamFormat = 'dupla' | 'trio' | 'quarteto' | 'quinteto';

export interface RankingParticipant {
  id: string;
  points: number;
  tournaments: number;
  /** Chip de esporte do perfil (`beachVolleyball`…), não o esporte do torneio. */
  sport: string;
  gender: RankingGender | null;
  /** `null` no ranking individual. */
  format: TeamFormat | null;
}

export interface RankingEntry {
  position: number;
  points: number;
  tournaments: number;
}

/** Recorte de quem pergunta: o próprio esporte, o próprio gênero (desconhecido = "Todos", como
 *  no app) e, para times, o próprio formato. Ordenação estável: empate fica na ordem em que o
 *  ranking chegou, exatamente como a tela do app numera. */
export function rankingEntryOf(all: readonly RankingParticipant[], id: string): RankingEntry | null {
  const me = all.find((p) => p.id === id);
  if (!me) return null;
  const slice = all
    .filter((p) => p.sport === me.sport)
    .filter((p) => me.gender == null || p.gender === me.gender)
    .filter((p) => me.format == null || p.format === me.format)
    .sort((a, b) => b.points - a.points);
  return { position: slice.indexOf(me) + 1, points: me.points, tournaments: me.tournaments };
}

/** Grafias reais dos docs ("Masculino"/"Feminino"/"Misto"/"Mista", "m"/"f", inglês). */
export function normalizeRankingGender(raw: string | null | undefined): RankingGender | null {
  const n = (raw ?? '').trim().toLowerCase();
  if (n.length === 0) return null;
  if (n.startsWith('masc') || n === 'm' || n === 'male') return 'male';
  if (n.startsWith('fem') || n === 'f' || n === 'female') return 'female';
  if (n.startsWith('mist') || n.startsWith('mix') || n === 'x') return 'mixed';
  return null;
}

/** O `gender` do doc do time vence; sem ele, todos iguais mantém e diferentes vira misto. */
export function deriveTeamGender(teamGender: string | null, memberGenders: readonly (string | null)[]): RankingGender | null {
  const fromTeam = normalizeRankingGender(teamGender);
  if (fromTeam != null) return fromTeam;
  const known = memberGenders.map(normalizeRankingGender).filter((g): g is RankingGender => g != null);
  if (known.length === 0) return null;
  return known.every((g) => g === known[0]) ? known[0]! : 'mixed';
}

/** `teamSize` (equipes nomeadas) vence; dupla legada não grava nenhum dos dois. */
export function teamFormatOf(teamSize: number | null, memberCount: number): TeamFormat {
  const size = teamSize ?? memberCount;
  if (size >= 5) return 'quinteto';
  if (size === 4) return 'quarteto';
  if (size === 3) return 'trio';
  return 'dupla';
}
