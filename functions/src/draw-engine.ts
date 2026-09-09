import {
  feasibleGroups,
  type DrawConstraints,
  type DrawGroupState,
  type DrawRelaxedRule,
  type DrawTeamMeta,
} from "./draw-constraints";
import {potIndexAt} from "./draw-plan";
import type {DrawPot} from "./draw-pots";

/**
 * O motor de uma revelação — puro, com o acaso INJETADO.
 *
 * A callable fica com a transação do Firestore e a fonte de aleatoriedade
 * (`crypto.randomInt`); toda a decisão mora aqui, onde dá pra testar roteirizando
 * o sorteador. É essa separação que torna o sorteio auditável: o mesmo estado e
 * a mesma sequência de números produzem a mesma revelação.
 *
 * Cada revelação são DOIS sorteios, que é o que o telão desenha como dois dados:
 * qual dupla sai do pote, e para onde ela vai.
 */

export type DrawFormat = "groups_knockout" | "double_elimination";

export type DrawDestination =
  | {type: "group"; groupId: string}
  | {type: "seed"; seed: number};

export interface DrawReveal {
  teamId: string;
  destination: DrawDestination;
  relaxed: DrawRelaxedRule[];
  /**
   * Revelação de lugar já definido (cabeça de chave). Presente SÓ quando é o
   * caso — o comprovante usa isso pra separar o que foi sorteado do que já
   * estava decidido. Sem essa marca o documento afirmaria acaso onde não houve.
   */
  preassigned?: true;
}

export interface DrawEngineState {
  format: DrawFormat;
  constraints: DrawConstraints;
  /** Potes congelados na criação da sessão. */
  pots: DrawPot[];
  teamsById: Record<string, DrawTeamMeta>;
  /** Estado dos grupos (formato de grupos). */
  groups: DrawGroupState[];
  /** Dupla eliminatória: posição `i` é o seed `i + 1`; `null` = ainda em aberto. */
  seedOrder: Array<string | null>;
  lockedSeedCount: number;
  /** Duplas já sorteadas, na ordem — reconstruído do log. */
  revealedTeamIds: string[];
}

export type NextRevealResult =
  | {status: "ok"; reveal: DrawReveal}
  /** Não há mais o que sortear. */
  | {status: "done"}
  /** Sobrou dupla mas não sobrou destino — invariante quebrada, a callable falha alto. */
  | {status: "blocked"; teamId: string};

/** Sorteador: recebe o tamanho do universo e devolve um índice em `[0, max)`. */
export type RandomIndex = (max: number) => number;

/** Chave canônica do destino, usada no hash do log e no comprovante. */
export function destinationKeyOf(destination: DrawDestination): string {
  return destination.type === "group" ?
    `grupo:${destination.groupId}` :
    `seed:${destination.seed}`;
}

const pickFrom = <T>(items: readonly T[], random: RandomIndex): T => {
  const index = Math.min(Math.max(random(items.length), 0), items.length - 1);
  return items[index]!;
};

/**
 * A revelação do pote 1 quando as cabeças têm lugar definido, ou `null` quando
 * a regra não se aplica (outro pote, regra desligada, ou sessão com mais
 * cabeças do que grupos — aí é melhor sortear do que travar a transmissão).
 *
 * `pot.teamIds` já vem em ordem de ranking (`buildGroupPots` fatia a lista
 * ordenada) e `state.groups` em ordem de grupo, então a correspondência é
 * posicional: 1ª cabeça → 1º grupo.
 */
function preassignedSeedReveal(
  state: DrawEngineState,
  potIndex: number,
  pot: DrawPot | undefined,
  teamId: string,
): DrawReveal | null {
  if (potIndex !== 1 || !pot || !state.constraints.seedsPreassigned) return null;
  const group = state.groups[pot.teamIds.indexOf(teamId)];
  if (!group || group.teamIds.length >= group.capacity) return null;
  return {
    teamId,
    destination: {type: "group", groupId: group.groupId},
    relaxed: [],
    preassigned: true,
  };
}

function nextGroupsReveal(state: DrawEngineState, random: RandomIndex): NextRevealResult {
  const revealed = new Set(state.revealedTeamIds);
  const potIndex = potIndexAt(state.pots, state.revealedTeamIds.length + 1);
  const pot = state.pots.find((p) => p.index === potIndex);
  const remaining = pot ? pot.teamIds.filter((id) => !revealed.has(id)) : [];
  if (remaining.length === 0) return {status: "done"};

  // A cabeça da vez é a primeira ainda não revelada do pote — em ordem de
  // ranking, e sem gastar aleatoriedade, que é o que separa encenação de
  // sorteio.
  const preassigned = preassignedSeedReveal(state, potIndex, pot, remaining[0]!);
  if (preassigned) return {status: "ok", reveal: preassigned};

  const teamId = pickFrom(remaining, random);
  const {groupIds, relaxed} = feasibleGroups({
    teamId,
    groups: state.groups,
    potTeamIds: remaining,
    teamsById: state.teamsById,
    constraints: state.constraints,
  });
  if (groupIds.length === 0) return {status: "blocked", teamId};

  return {
    status: "ok",
    reveal: {teamId, destination: {type: "group", groupId: pickFrom(groupIds, random)}, relaxed},
  };
}

function nextDeReveal(state: DrawEngineState, random: RandomIndex): NextRevealResult {
  const placed = new Set(state.seedOrder.filter((id): id is string => !!id));
  const remaining = state.pots
    .flatMap((p) => p.teamIds)
    .filter((id) => !placed.has(id) && !state.revealedTeamIds.includes(id));

  const openSeeds = state.seedOrder
    .map((teamId, i) => (teamId == null ? i + 1 : 0))
    .filter((seed) => seed > 0);

  if (remaining.length === 0 || openSeeds.length === 0) return {status: "done"};

  const teamId = pickFrom(remaining, random);
  return {
    status: "ok",
    reveal: {teamId, destination: {type: "seed", seed: pickFrom(openSeeds, random)}, relaxed: []},
  };
}

/** A próxima revelação, sem tocar em Firestore e sem mutar o estado. */
export function nextReveal(state: DrawEngineState, random: RandomIndex): NextRevealResult {
  return state.format === "double_elimination" ?
    nextDeReveal(state, random) :
    nextGroupsReveal(state, random);
}

/**
 * Estado depois da revelação. Retorna um estado NOVO — rodar o log inteiro por
 * cima do estado inicial é como o console, o telão e a publicação reconstroem a
 * colocação sem confiar em nenhum acumulado.
 */
export function applyReveal(state: DrawEngineState, reveal: DrawReveal): DrawEngineState {
  const revealedTeamIds = [...state.revealedTeamIds, reveal.teamId];

  if (reveal.destination.type === "seed") {
    const seedOrder = [...state.seedOrder];
    seedOrder[reveal.destination.seed - 1] = reveal.teamId;
    return {...state, seedOrder, revealedTeamIds};
  }

  const groupId = reveal.destination.groupId;
  return {
    ...state,
    groups: state.groups.map((g) =>
      g.groupId === groupId ? {...g, teamIds: [...g.teamIds, reveal.teamId]} : g,
    ),
    revealedTeamIds,
  };
}
