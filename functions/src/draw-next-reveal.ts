import {BRACKET_DEFINITIONS} from "./bracket-definitions/bracket-definitions";
import {dePlacementFor} from "./draw-de-placement";
import {destinationKeyOf, nextReveal, type RandomIndex} from "./draw-engine";
import {appendReveal} from "./draw-log";
import {phraseContextsFor, pickPhrase, type Phrase} from "./draw-phrases";
import {
  groupsFromReveals,
  rebuildEngineState,
  type DrawSessionDoc,
  type DrawSessionReveal,
} from "./draw-session-model";

/**
 * A decisão inteira de uma revelação, sem Firestore.
 *
 * A callable fica com a transação; tudo que importa — idempotência, sorteio,
 * cadeia de hash, frase, consequência da planta — acontece aqui, onde dá pra
 * testar roteirizando o sorteador e o relógio.
 */

export type DrawNextOutcome =
  | {kind: "applied"; reveal: DrawSessionReveal}
  /** O cliente pediu um índice que não é o atual: clique duplo, retry, timer em corrida. */
  | {kind: "stale"; currentIndex: number}
  | {kind: "done"}
  | {kind: "blocked"; teamId: string};

/** Grupo mais forte da chave — gancho da frase "grupo da morte". */
function isStrongestGroup(
  doc: DrawSessionDoc,
  reveals: readonly DrawSessionReveal[],
  groupId: string,
): boolean {
  const groups = groupsFromReveals(doc, reveals);
  const mine = groups.find((g) => g.groupId === groupId);
  if (!mine || mine.teamIds.length < 2) return false;
  const pointsOf = (teamId: string) => doc.entrants.find((e) => e.teamId === teamId)?.points ?? 0;
  const strength = (teamIds: readonly string[]) =>
    teamIds.reduce((sum, id) => sum + pointsOf(id), 0);
  const mineStrength = strength(mine.teamIds);
  return groups.every((g) => g.groupId === groupId || strength(g.teamIds) < mineStrength);
}

function hasConterranea(
  doc: DrawSessionDoc,
  reveals: readonly DrawSessionReveal[],
  groupId: string,
  teamId: string,
): boolean {
  const city = (doc.entrants.find((e) => e.teamId === teamId)?.city ?? "").trim().toLowerCase();
  if (!city) return false;
  const group = groupsFromReveals(doc, reveals).find((g) => g.groupId === groupId);
  return (group?.teamIds ?? [])
    .filter((id) => id !== teamId)
    .some(
      (id) =>
        (doc.entrants.find((e) => e.teamId === id)?.city ?? "").trim().toLowerCase() === city,
    );
}

/**
 * Próxima revelação a gravar.
 *
 * `expectedIndex` é o número de revelações que o cliente acredita existirem. Se
 * não bater com o documento, NADA é sorteado e o retorno é `stale` — não é
 * erro: é como clique duplo, retry de rede e o timer do modo automático
 * disparando junto com o clique do organizador terminam todos sem efeito.
 */
export function computeNextReveal(
  doc: DrawSessionDoc,
  expectedIndex: number,
  random: RandomIndex,
  nowMillis: number,
): DrawNextOutcome {
  if (doc.reveals.length !== expectedIndex) {
    return {kind: "stale", currentIndex: doc.reveals.length};
  }

  const state = rebuildEngineState(doc);
  const result = nextReveal(state, random);
  if (result.status === "done") return {kind: "done"};
  if (result.status === "blocked") return {kind: "blocked", teamId: result.teamId};

  const {reveal} = result;
  const entrant = doc.entrants.find((e) => e.teamId === reveal.teamId);
  const destination = reveal.destination;

  const dePlacement =
    doc.format === "double_elimination" && destination.type === "seed" ?
      dePlacementFor(
        BRACKET_DEFINITIONS[doc.entrants.length] ?? [],
        destination.seed,
        doc.config.lockedSeedCount,
      ) :
      null;

  const entry = appendReveal(doc.reveals, doc.genesisHash, {
    teamId: reveal.teamId,
    destinationKey: destinationKeyOf(destination),
    atMillis: nowMillis,
  });

  let phrase: Phrase | null = null;
  if (doc.config.phrasesEnabled) {
    // O contexto olha o estado DEPOIS desta revelação — "grupo da morte" e
    // "mesma cidade" só fazem sentido com a dupla já dentro do grupo.
    const after: DrawSessionReveal[] = [
      ...doc.reveals,
      {...entry, destination, relaxed: reveal.relaxed, phrase: null, dePlacement},
    ];
    phrase = pickPhrase(
      phraseContextsFor({
        format: doc.format,
        potIndex: entrant?.potIndex ?? 1,
        totalPots: doc.pots.length,
        isSeed: entrant?.lockedSeed != null || (entrant?.potIndex ?? 0) === 1,
        sameCityInGroup:
          destination.type === "group" &&
          hasConterranea(doc, after, destination.groupId, reveal.teamId),
        isStrongestGroup:
          destination.type === "group" && isStrongestGroup(doc, after, destination.groupId),
        meetsSeedOnDebut: dePlacement?.meetsSeed?.winsNeeded === 0,
      }),
      new Set(doc.reveals.map((r) => r.phrase?.id).filter((id): id is string => !!id)),
      random,
    );
  }

  return {
    kind: "applied",
    reveal: {...entry, destination, relaxed: reveal.relaxed, phrase, dePlacement},
  };
}
