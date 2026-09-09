import {applyReveal, type DrawDestination, type DrawEngineState, type DrawFormat} from "./draw-engine";
import type {DrawConstraints, DrawGroupState, DrawRelaxedRule, DrawTeamMeta} from "./draw-constraints";
import type {DePlacement, SeedPairing} from "./draw-de-placement";
import type {DrawRevealLogEntry} from "./draw-log";
import type {Phrase} from "./draw-phrases";
import {groupCapacities} from "./draw-plan";
import type {DrawPot} from "./draw-pots";

/**
 * Forma do documento `drawSessions/{id}` e a reconstrução do estado a partir do
 * log.
 *
 * O documento é a ÚNICA fonte que console e telão leem — um `onSnapshot` cada,
 * sem nenhuma outra coleção. Por isso `entrants` é um snapshot congelado
 * (fotos, nível, cartel): o telão público não pode depender de ler
 * `public_profiles`, `athleteRatings` e `matches` com centenas de aparelhos
 * conectados.
 *
 * `groups` e `seedOrder` NÃO são gravados. Eles são dobrados do log toda vez —
 * é isso que faz um telão que reconecta no meio da transmissão chegar
 * exatamente ao mesmo estado, sem depender de ter recebido cada evento.
 */

export type DrawSessionStatus = "draft" | "scheduled" | "live" | "published" | "voided";
export type DrawConductionMode = "manual" | "auto" | "hybrid";

/** Snapshot da dupla no momento da criação da sessão. */
export interface DrawSessionEntrant {
  teamId: string;
  /** "Ana / Bia" — já pronto pra tela. */
  label: string;
  playerNames: string[];
  photoUrls: Array<string | null>;
  city: string | null;
  levelLabel: string;
  points: number | null;
  rating: number | null;
  potIndex: number;
  /** Seed travado quando a dupla é cabeça; `null` quando entra no sorteio. */
  lockedSeed: number | null;
  stats: {
    wins: number;
    losses: number;
    titles: number;
    /** Últimos 5 resultados, do mais recente pro mais antigo. */
    last5: Array<"V" | "D">;
  };
}

/** Uma revelação gravada: a entrada do log mais o que a tela precisa desenhar. */
export interface DrawSessionReveal extends DrawRevealLogEntry {
  destination: DrawDestination;
  relaxed: DrawRelaxedRule[];
  phrase: Phrase | null;
  /** Dupla eliminatória: consequência já resolvida pela planta. */
  dePlacement: DePlacement | null;
}

export interface DrawSessionConfig {
  mode: DrawConductionMode;
  intervalMs: number;
  phrasesEnabled: boolean;
  /** Dupla eliminatória: quantas cabeças entram sem sorteio. */
  lockedSeedCount: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  constraints: DrawConstraints;
}

/** Desenho da chave que só a planta conhece — resolvido na criação da sessão. */
export interface DrawBracketOutline {
  pairings: SeedPairing[];
  byeSeeds: number[];
}

export interface DrawSessionDoc {
  tournamentId: string;
  categoryId: string;
  tournamentName: string;
  categoryName: string;
  sportCode: string | null;
  format: DrawFormat;
  status: DrawSessionStatus;
  scheduledAt?: number | null;
  startedAt?: number | null;
  publishedAt?: number | null;
  voidedAt?: number | null;
  voidReason?: string | null;
  config: DrawSessionConfig;
  pots: DrawPot[];
  entrants: DrawSessionEntrant[];
  reveals: DrawSessionReveal[];
  genesisHash: string;
  totalReveals: number;
  bracketOutline: DrawBracketOutline | null;
  createdBy?: string;
  createdAt?: number;
}

/** Metadados que as restrições consultam, indexados por dupla. */
export function teamsByIdFrom(doc: DrawSessionDoc): Record<string, DrawTeamMeta> {
  return Object.fromEntries(
    doc.entrants.map((e) => [e.teamId, {teamId: e.teamId, potIndex: e.potIndex, city: e.city}]),
  );
}

/** Grupos com a capacidade da sessão, preenchidos pelo log. */
export function groupsFromReveals(
  doc: DrawSessionDoc,
  reveals: readonly DrawSessionReveal[],
): DrawGroupState[] {
  const groups = groupCapacities(doc.entrants.length, doc.config.teamsPerGroup);
  for (const reveal of reveals) {
    const destination = reveal.destination;
    if (destination.type !== "group") continue;
    const group = groups.find((g) => g.groupId === destination.groupId);
    if (group) group.teamIds.push(reveal.teamId);
  }
  return groups;
}

/**
 * Ordem de seeds da dupla eliminatória: as cabeças já entram cravadas (elas não
 * são sorteadas), e cada revelação preenche um número em aberto.
 */
export function seedOrderFromReveals(
  doc: DrawSessionDoc,
  reveals: readonly DrawSessionReveal[],
): Array<string | null> {
  const order: Array<string | null> = new Array(doc.entrants.length).fill(null);
  for (const entrant of doc.entrants) {
    if (entrant.lockedSeed != null) order[entrant.lockedSeed - 1] = entrant.teamId;
  }
  for (const reveal of reveals) {
    if (reveal.destination.type !== "seed") continue;
    order[reveal.destination.seed - 1] = reveal.teamId;
  }
  return order;
}

/**
 * Estado do motor reconstruído do zero a partir do documento. Não confia em
 * nenhum acumulado — replay puro do log.
 */
export function rebuildEngineState(doc: DrawSessionDoc): DrawEngineState {
  const base: DrawEngineState = {
    format: doc.format,
    constraints: doc.config.constraints,
    pots: doc.pots,
    teamsById: teamsByIdFrom(doc),
    groups: groupCapacities(doc.entrants.length, doc.config.teamsPerGroup),
    seedOrder: seedOrderFromReveals(doc, []),
    lockedSeedCount: doc.config.lockedSeedCount,
    revealedTeamIds: [],
  };

  return doc.reveals.reduce(
    (state, reveal) =>
      applyReveal(state, {
        teamId: reveal.teamId,
        destination: reveal.destination,
        relaxed: reveal.relaxed,
      }),
    base,
  );
}
