/**
 * Espelho no cliente do documento `drawSessions/{id}`.
 *
 * Gêmeo de `functions/src/draw-session-model.ts`. O portal NUNCA escreve aqui —
 * as rules recusam escrita de qualquer cliente, inclusive do dono do torneio.
 * Este arquivo é só a leitura tipada do que as callables gravaram.
 */

export type DrawSessionStatus = 'draft' | 'scheduled' | 'live' | 'published' | 'voided';
export type DrawConductionMode = 'manual' | 'auto' | 'hybrid';
export type DrawFormat = 'groups_knockout' | 'double_elimination' | 'king_of_court';

/** Sorteio que distribui as duplas em CAIXAS de capacidade fixa.
 *
 *  Grupos e King of the Court são a mesma mecânica: cada dupla cai numa caixa
 *  com vaga. O que muda é o NOME da caixa — na KOTC é uma rodada da
 *  classificatória, não um grupo. Espelha `isBoxedDraw` do servidor. */
export function isBoxedDraw(format: DrawFormat): boolean {
  return format !== 'double_elimination';
}

/** Nome da caixa para o público. O `groupId` vem como letra (A, B, C…) das
 *  capacidades do sorteio; na KOTC ele é a ENÉSIMA rodada. */
export function drawBoxLabel(format: DrawFormat, groupId: string): string {
  if (format !== 'king_of_court') return `Grupo ${groupId}`;
  const index = groupId.charCodeAt(0) - 65;
  return index >= 0 ? `Rodada ${index + 1}` : `Rodada ${groupId}`;
}

/** Como o formato se chama na tela. */
export function drawFormatLabel(format: DrawFormat): string {
  if (format === 'double_elimination') return 'Dupla eliminatória';
  if (format === 'king_of_court') return 'King of the Court';
  return 'Fase de grupos + mata-mata';
}

export type DrawDestination =
  | { type: 'group'; groupId: string }
  | { type: 'seed'; seed: number };

export interface DrawConstraints {
  seedsApart: boolean;
  potsPerGroup: boolean;
  avoidSameCity: boolean;
  /** Cabeças abrem no grupo que o ranking já definiu (1ª → A, 2ª → B, …). */
  seedsPreassigned?: boolean;
}

export interface DrawSessionEntrant {
  teamId: string;
  label: string;
  playerNames: string[];
  photoUrls: Array<string | null>;
  city: string | null;
  levelLabel: string;
  points: number | null;
  rating: number | null;
  potIndex: number;
  lockedSeed: number | null;
  stats: { wins: number; losses: number; titles: number; last5: Array<'V' | 'D'> };
}

/** Encontro projetado com a cabeça mais próxima, assumindo favoritismo. */
export interface DrawProjectedMeeting {
  seed: number;
  round: number;
  winsNeeded: number;
}

/** Consequência da colocação na dupla eliminatória, já resolvida pela planta no servidor. */
export interface DrawDePlacement {
  seed: number;
  entryMatchNumber: number;
  entryRound: number;
  hasBye: boolean;
  opponentSeed: number | null;
  opponentFromMatch: number | null;
  meetsSeed: DrawProjectedMeeting | null;
}

export interface DrawSessionReveal {
  index: number;
  teamId: string;
  destinationKey: string;
  /** Instante do SERVIDOR — âncora de toda a animação (ver `draw-reveal-phase.ts`). */
  atMillis: number;
  prevHash: string;
  hash: string;
  destination: DrawDestination;
  relaxed: string[];
  phrase: { id: string; text: string } | null;
  dePlacement: DrawDePlacement | null;
  /** Cabeça com lugar já definido: teve o mesmo show, mas não foi sorteada. */
  preassigned?: true;
}

export interface DrawSessionConfig {
  mode: DrawConductionMode;
  intervalMs: number;
  phrasesEnabled: boolean;
  lockedSeedCount: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  constraints: DrawConstraints;
}

export interface DrawSessionPot {
  index: number;
  teamIds: string[];
}

/** Confronto de abertura da chave de vencedores, lido da planta pelo servidor. */
export interface DrawSeedPairing {
  matchNumber: number;
  seedA: number;
  seedB: number;
}

export interface DrawSession {
  id: string;
  tournamentId: string;
  categoryId: string;
  tournamentName: string;
  categoryName: string;
  sportCode: string | null;
  format: DrawFormat;
  status: DrawSessionStatus;
  scheduledAt: number | null;
  startedAt: number | null;
  publishedAt: number | null;
  voidedAt: number | null;
  voidReason: string | null;
  config: DrawSessionConfig;
  pots: DrawSessionPot[];
  entrants: DrawSessionEntrant[];
  reveals: DrawSessionReveal[];
  genesisHash: string;
  totalReveals: number;
  /**
   * Última revelação que o organizador liberou para a tabela.
   *
   * Existe por causa do modo manual: o spotlight fica na tela até ele mandar
   * seguir, e o telão é OUTRO cliente — só aprende disso pelo documento.
   */
  spotlightClearedIndex?: number;
  bracketOutline: { pairings: DrawSeedPairing[]; byeSeeds: number[] } | null;
}

export interface DrawGroupView {
  groupId: string;
  capacity: number;
  entrants: DrawSessionEntrant[];
}
