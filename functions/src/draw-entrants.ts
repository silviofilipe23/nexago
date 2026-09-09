import {levelDisplayLabel} from "./category-level-eligibility";
import type {DrawSessionEntrant} from "./draw-session-model";
import {teamStrength, type AthleteLevelSource, type AthleteRatingLite, type DrawPot} from "./draw-pots";

/**
 * Montagem do snapshot de duplas gravado na sessão de sorteio.
 *
 * Tudo aqui é PURO: quem lê `teams`, `public_profiles`, `athleteRatings` e
 * `matches` é a callable. A separação existe porque este é o material que vai
 * ao ar no telão — nome, foto, cidade, nível, cartel — e errar aqui é errar na
 * frente de todo mundo.
 *
 * O snapshot é congelado de propósito: o telão público lê UM documento e nada
 * mais, com centenas de aparelhos conectados ao mesmo tempo.
 */

/** Perfil resolvido de um atleta da dupla. */
export interface EntrantProfile {
  displayName: string;
  photoUrl: string | null;
  city: string | null;
  levelsBySport: Record<string, string>;
  legacyLevel: string | null;
}

/** Uma partida concluída da dupla, do mais recente pro mais antigo. */
export interface EntrantHistoryMatch {
  won: boolean;
  isFinal: boolean;
  tournamentId: string;
}

export interface EntrantSource {
  teamId: string;
  /** Nome próprio da equipe, quando existe. */
  teamName: string | null;
  profiles: EntrantProfile[];
  ratings: Array<AthleteRatingLite | null>;
  history: EntrantHistoryMatch[];
}

export type EntrantStats = DrawSessionEntrant["stats"];

const firstName = (full: string): string => full.trim().split(/\s+/)[0] ?? "";

/**
 * Cartel derivado do histórico. "Título" é final vencida, contada uma vez por
 * torneio — mesma regra de `titleTournamentIds` no portal do atleta, que existe
 * porque não há campo `titles` no schema.
 */
export function teamHistoryStats(history: readonly EntrantHistoryMatch[]): EntrantStats {
  const wins = history.filter((m) => m.won).length;
  const titles = new Set(
    history.filter((m) => m.won && m.isFinal && m.tournamentId).map((m) => m.tournamentId),
  ).size;
  return {
    wins,
    losses: history.length - wins,
    titles,
    last5: history.slice(0, 5).map((m) => (m.won ? "V" : "D")),
  };
}

/**
 * Duplas prontas pra gravar na sessão.
 *
 * `pots` define o pote de cada uma; `lockedTeamIds` são as cabeças travadas da
 * dupla eliminatória, na ordem — a primeira vira seed 1, a segunda seed 2, e
 * assim por diante.
 */
export function buildEntrants(
  sources: readonly EntrantSource[],
  sportCode: string | null,
  pots: readonly DrawPot[],
  lockedTeamIds: readonly string[] = [],
): DrawSessionEntrant[] {
  const potOf = (teamId: string): number => {
    const found = pots.find((p) => p.teamIds.includes(teamId));
    return found ? found.index : pots.length > 0 ? pots[pots.length - 1]!.index : 1;
  };

  return sources.map((source) => {
    const levels: AthleteLevelSource[] = source.profiles.map((p) => ({
      levelsBySport: p.levelsBySport,
      legacyLevel: p.legacyLevel,
    }));
    const strength = teamStrength(levels, sportCode, source.ratings);
    const names = source.profiles.map((p) => p.displayName.trim()).filter((n) => n.length > 0);
    const lockedIndex = lockedTeamIds.indexOf(source.teamId);

    return {
      teamId: source.teamId,
      label:
        source.teamName?.trim() ||
        (names.length > 0 ? names.map(firstName).join(" / ") : "Dupla"),
      playerNames: names,
      photoUrls: source.profiles.map((p) => p.photoUrl ?? null),
      city: source.profiles.map((p) => p.city?.trim() || null).find((c) => c) ?? null,
      levelLabel: levels
        .map((l) => levelDisplayLabel(l.levelsBySport[sportCode ?? ""] ?? l.legacyLevel))
        .filter((label): label is string => !!label)
        .map((label) => label.replace("Intermediário", "Interm."))
        .join(" + "),
      points: strength.points,
      rating: strength.rating,
      potIndex: potOf(source.teamId),
      lockedSeed: lockedIndex >= 0 ? lockedIndex + 1 : null,
      stats: teamHistoryStats(source.history),
    };
  });
}
