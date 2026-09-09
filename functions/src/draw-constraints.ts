/**
 * Restrições do sorteio de fase de grupos e a checagem de viabilidade.
 *
 * O plano original previa "sortear, e se travar, recuar um passo e re-sortear".
 * Aqui a escolha é outra: antes de sortear, o módulo devolve só os destinos que
 * MANTÊM O RESTO DO POTE SOLÚVEL. Sem recuo, sem desfazer — e, como o log é
 * append-only e encadeado, desfazer seria justamente o que não podemos fazer.
 *
 * A viabilidade é um emparelhamento bipartido (duplas do pote × grupos abertos).
 * Os tamanhos são minúsculos (≤ 8 de cada lado), então o algoritmo de caminhos
 * aumentantes de Kuhn resolve de sobra.
 *
 * Módulo puro — sem Firestore.
 */

export interface DrawConstraints {
  /** Cabeças (pote 1) nunca no mesmo grupo. */
  seedsApart: boolean;
  /** Um slot de cada grupo por rodada de pote. */
  potsPerGroup: boolean;
  /** Evita mesma cidade no grupo; relaxa sozinha se travar a chave. */
  avoidSameCity: boolean;
  /**
   * Cabeças com lugar JÁ DEFINIDO: a 1ª do ranking abre o grupo A, a 2ª o B, e
   * assim por diante. O telão continua rolando os dados, mas o resultado do
   * pote 1 não depende do acaso — e a revelação sai marcada para o comprovante
   * não vender como sorteio o que não foi.
   *
   * Opcional porque sessões criadas antes desta regra não têm o campo; ausente
   * = cabeças sorteadas, que era o comportamento delas.
   */
  seedsPreassigned?: boolean;
}

export interface DrawGroupState {
  groupId: string;
  /** Quantas duplas o grupo comporta (pode variar: 4/4/3/3). */
  capacity: number;
  /** Já colocadas. */
  teamIds: string[];
}

export interface DrawTeamMeta {
  teamId: string;
  /** 1-based. Pote 1 = cabeças. */
  potIndex: number;
  city: string | null;
}

/** Motivos de relaxamento gravados na revelação e mostrados no comprovante. */
export type DrawRelaxedRule = "same_city";

export interface FeasibleDestinations {
  groupIds: string[];
  relaxed: DrawRelaxedRule[];
}

const normalizeCity = (city: string | null | undefined): string =>
  (city ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Grupo ainda cabe alguém? */
const hasRoom = (group: DrawGroupState): boolean => group.teamIds.length < group.capacity;

/**
 * A dupla pode entrar neste grupo, olhando SÓ as regras locais (sem pensar no
 * resto do pote). `honorCity` desligado é o passo de relaxamento.
 */
function allows(
  team: DrawTeamMeta,
  group: DrawGroupState,
  teamsById: Readonly<Record<string, DrawTeamMeta>>,
  constraints: DrawConstraints,
  honorCity: boolean,
): boolean {
  if (!hasRoom(group)) return false;

  const occupants = group.teamIds.map((id) => teamsById[id]).filter((m): m is DrawTeamMeta => !!m);

  if (constraints.potsPerGroup && occupants.some((o) => o.potIndex === team.potIndex)) return false;
  if (constraints.seedsApart && team.potIndex === 1 && occupants.some((o) => o.potIndex === 1)) {
    return false;
  }
  if (honorCity && constraints.avoidSameCity) {
    const city = normalizeCity(team.city);
    if (city && occupants.some((o) => normalizeCity(o.city) === city)) return false;
  }
  return true;
}

/**
 * Existe atribuição para TODAS as duplas de `teamIds` nos grupos, respeitando
 * as capacidades? Kuhn sobre o grafo bipartido, com cada grupo expandido em
 * tantos "assentos" quanto sua vaga restante permite.
 */
function allAssignable(
  teamIds: readonly string[],
  groups: readonly DrawGroupState[],
  teamsById: Readonly<Record<string, DrawTeamMeta>>,
  constraints: DrawConstraints,
  honorCity: boolean,
): boolean {
  if (teamIds.length === 0) return true;

  // Um assento por vaga livre. Com `potsPerGroup` o grupo recebe no máximo uma
  // dupla deste pote, então um assento por grupo já é o teto real — mas manter
  // a expansão geral faz a função valer com a regra desligada também.
  const seats: Array<{groupIndex: number}> = [];
  groups.forEach((group, groupIndex) => {
    const free = constraints.potsPerGroup
      ? Math.min(1, group.capacity - group.teamIds.length)
      : group.capacity - group.teamIds.length;
    for (let i = 0; i < free; i++) seats.push({groupIndex});
  });

  const seatOwner: Array<string | null> = seats.map(() => null);

  const tryAssign = (teamId: string, seen: Set<number>): boolean => {
    const team = teamsById[teamId];
    if (!team) return false;
    for (let s = 0; s < seats.length; s++) {
      if (seen.has(s)) continue;
      const group = groups[seats[s]!.groupIndex]!;
      if (!allows(team, group, teamsById, constraints, honorCity)) continue;
      seen.add(s);
      const owner = seatOwner[s];
      if (owner == null || tryAssign(owner, seen)) {
        seatOwner[s] = teamId;
        return true;
      }
    }
    return false;
  };

  for (const teamId of teamIds) {
    if (!tryAssign(teamId, new Set())) return false;
  }
  return true;
}

/** Destinos viáveis com um dado nível de rigor, ou lista vazia. */
function destinationsHonoring(
  teamId: string,
  groups: readonly DrawGroupState[],
  potTeamIds: readonly string[],
  teamsById: Readonly<Record<string, DrawTeamMeta>>,
  constraints: DrawConstraints,
  honorCity: boolean,
): string[] {
  const team = teamsById[teamId];
  if (!team) return [];
  const others = potTeamIds.filter((id) => id !== teamId);

  return groups
    .filter((group) => {
      if (!allows(team, group, teamsById, constraints, honorCity)) return false;
      const after = groups.map((g) =>
        g.groupId === group.groupId ? {...g, teamIds: [...g.teamIds, teamId]} : g,
      );
      return allAssignable(others, after, teamsById, constraints, honorCity);
    })
    .map((g) => g.groupId);
}

/**
 * Destinos onde esta dupla pode cair AGORA sem tornar o resto do pote
 * impossível.
 *
 * `potTeamIds` são as duplas ainda no pote, incluindo a que vai ser sorteada.
 * Lista vazia significa que não há mais vaga — a callable lê isso como fim do
 * sorteio, não como erro.
 *
 * Quando "evitar mesma cidade" travaria tudo, ela cai e o retorno diz
 * `relaxed: ["same_city"]`; a revelação grava esse motivo e o comprovante
 * público o mostra. Relaxar em silêncio seria pior que não ter a regra.
 */
export function feasibleGroups(params: {
  teamId: string;
  groups: readonly DrawGroupState[];
  potTeamIds: readonly string[];
  teamsById: Readonly<Record<string, DrawTeamMeta>>;
  constraints: DrawConstraints;
}): FeasibleDestinations {
  const {teamId, groups, potTeamIds, teamsById, constraints} = params;

  const strict = destinationsHonoring(teamId, groups, potTeamIds, teamsById, constraints, true);
  if (strict.length > 0) return {groupIds: strict, relaxed: []};

  if (!constraints.avoidSameCity) return {groupIds: [], relaxed: []};

  const relaxedCity = destinationsHonoring(teamId, groups, potTeamIds, teamsById, constraints, false);
  if (relaxedCity.length === 0) return {groupIds: [], relaxed: []};
  return {groupIds: relaxedCity, relaxed: ["same_city"]};
}
