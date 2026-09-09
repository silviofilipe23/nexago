import {groupCapacities, deSeedSlots} from "./draw-plan";
import {buildGroupPots, type DrawPot} from "./draw-pots";
import type {DrawSessionDoc, DrawSessionEntrant} from "./draw-session-model";

/**
 * Reordenação das cabeças de chave de uma sessão de sorteio.
 *
 * A sessão nasce com a ordem sugerida pelo nível declarado, mas o organizador
 * conhece o torneio dele: campeã da etapa anterior, dupla que subiu de
 * categoria, atleta voltando de lesão. Esta é a porta para ele mandar — e é a
 * MESMA porta que a criação usa, então a ordem automática e a manual produzem
 * potes pela mesma regra.
 *
 * Puro, sem Firestore: a callable valida, chama daqui e grava.
 */

export type SeedOrderVerdict =
  | {ok: true; order: string[]}
  | {ok: false; reason: "unknown_team" | "duplicate_team"};

/**
 * Normaliza a ordem recebida.
 *
 * Ordem PARCIAL é aceita de propósito: na prática o organizador mexe só nas
 * primeiras posições, e exigir a lista inteira faria a tela mandar 32 ids para
 * mudar dois. O que ficou de fora entra no fim, na ordem em que já estava —
 * ninguém some.
 */
export function validateSeedOrder(
  doc: DrawSessionDoc,
  order: readonly string[],
): SeedOrderVerdict {
  const known = new Set(doc.entrants.map((e) => e.teamId));
  const seen = new Set<string>();

  for (const teamId of order) {
    if (!known.has(teamId)) return {ok: false, reason: "unknown_team"};
    if (seen.has(teamId)) return {ok: false, reason: "duplicate_team"};
    seen.add(teamId);
  }

  const rest = doc.entrants.map((e) => e.teamId).filter((id) => !seen.has(id));
  return {ok: true, order: [...order, ...rest]};
}

export interface ResequencedSession {
  pots: DrawPot[];
  entrants: DrawSessionEntrant[];
  totalReveals: number;
}

/**
 * Potes e cabeças a partir de uma ordem de força.
 *
 * Em grupos, a ordem vira potes por fatias do número de grupos — o pote 1 são
 * as cabeças. Em dupla eliminatória, as primeiras ocupam os seeds travados e o
 * resto vai para o pote único do sorteio.
 */
export function resequenceSession(
  doc: DrawSessionDoc,
  order: readonly string[],
): ResequencedSession {
  const byId = new Map(doc.entrants.map((e) => [e.teamId, e]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((e): e is DrawSessionEntrant => !!e);

  if (doc.format === "double_elimination") {
    const {locked} = deSeedSlots(ordered.length, doc.config.lockedSeedCount);
    const lockedCount = locked.length;

    return {
      // O pote leva TODO MUNDO, cabeças na frente. Antes só carregava quem
      // seria sorteado, e a consequência era a chave nascer preenchida: as
      // cabeças nunca tinham um momento no telão. Agora elas entram na fila de
      // revelação — mesmo show, mesmo seed que o ranking já dava.
      pots: [{index: 1, teamIds: ordered.map((e) => e.teamId)}],
      entrants: ordered.map((entrant, i) => ({
        ...entrant,
        // Pote 1 = cabeças, pote 2 = quem entra no sorteio. A tela lê isso pra
        // distinguir as duas metades sem consultar `lockedSeed` em todo lugar.
        potIndex: i < lockedCount ? 1 : 2,
        lockedSeed: i < lockedCount ? i + 1 : null,
      })),
      totalReveals: ordered.length,
    };
  }

  const groupCount = groupCapacities(ordered.length, doc.config.teamsPerGroup).length;
  const pots = buildGroupPots(ordered.map((e) => e.teamId), groupCount);
  const potOf = new Map<string, number>();
  for (const pot of pots) for (const teamId of pot.teamIds) potOf.set(teamId, pot.index);

  return {
    pots,
    entrants: ordered.map((entrant) => ({
      ...entrant,
      potIndex: potOf.get(entrant.teamId) ?? 1,
      // Em grupos ninguém tem posição travada: quem decide o grupo é o sorteio.
      lockedSeed: null,
    })),
    totalReveals: ordered.length,
  };
}
