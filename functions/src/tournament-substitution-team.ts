/**
 * Efeito da substituição de atleta sobre o DOC DE EQUIPE.
 *
 * Antes da identidade única da dupla, um doc de equipe pertencia a exatamente
 * uma inscrição, e a troca podia reescrever `player1Id`/`player2Id`/`memberUids`
 * no lugar sem afetar ninguém. Com o reaproveitamento entre torneios
 * (`tournament-pair-team.ts`) esse invariante morreu: o MESMO doc serve a
 * inscrição do torneio encerrado e a do torneio aberto. Mutar in-place ali
 * reescreveria o elenco do outro torneio — a inscrição de lá ficaria com
 * `participantUids` divergindo da equipe (some das listagens, quebra
 * `inscriptionParticipantUidsMatchTeam`), o ranking daquela campanha passaria a
 * mostrar outra dupla, e o `pairKey` ficaria mentindo para sempre.
 *
 * Por isso a troca BIFURCA quando o doc é compartilhado: a inscrição desta
 * troca passa a apontar para o doc da dupla NOVA (reaproveitado ou criado) e o
 * compartilhado fica intacto. É seguro porque a substituição só é permitida
 * antes da publicação da chave — a inscrição que se move não tem partida.
 *
 * Equipe nomeada (trio+) nunca entra aqui: o doc dela é escopado ao torneio por
 * construção, então segue sendo mutado no lugar.
 *
 * Ver `docs/superpowers/specs/2026-09-15-identidade-unica-da-dupla-design.md`.
 */

import {
  FieldValue,
  type CollectionReference,
  type Transaction,
} from "firebase-admin/firestore";
import {isPairTeamDoc, resolvePairTeamTx} from "./tournament-pair-team";
import {buildPairKey} from "./tournament-pair-uniqueness";
import {replaceUidInList} from "./tournament-substitution-logic";
import {extractTeamMemberUids} from "./tournament-team-category";

export interface SubstitutionTeamParams {
  teamsRef: CollectionReference;
  inscriptionsRef: CollectionReference;
  tournamentId: string;
  /** Inscrição que está trocando de atleta. */
  registrationId: string;
  teamId: string;
  /** Doc de equipe já lido na transação. */
  team: Record<string, unknown>;
  outUid: string;
  inUid: string;
  /** Elenco da inscrição DEPOIS da troca. */
  rosterAfter: string[];
  /** Categoria de equipe nomeada (trio+): doc escopado ao torneio. */
  namedTeam: boolean;
}

export interface SubstitutionTeamOutcome {
  /** Equipe que a inscrição deve apontar depois da troca. */
  teamId: string;
  /** `true` = inscrição repontada para outro doc; o compartilhado ficou intacto. */
  forked: boolean;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A dupla DEPOIS da troca, nas posições do doc quando ele as conhece.
 *
 * Quando o doc não tem `outUid` em nenhum dos dois slots (elenco já divergente
 * de um estrago anterior), os player ids dele descrevem outra dupla — derivar
 * dali reaproveitaria/recriaria o par ERRADO. Nesse caso manda a inscrição.
 */
function pairAfterSubstitution(
  params: SubstitutionTeamParams,
): {player1Id: string; player2Id: string} {
  const p1 = trimmed(params.team.player1Id);
  const p2 = trimmed(params.team.player2Id);
  const teamKnowsOut = p1 === params.outUid || p2 === params.outUid;
  let player1Id = teamKnowsOut ? (p1 === params.outUid ? params.inUid : p1) : "";
  let player2Id = teamKnowsOut ? (p2 === params.outUid ? params.inUid : p2) : "";
  if (!player1Id) player1Id = params.rosterAfter[0] ?? "";
  if (!player2Id) {
    player2Id = params.rosterAfter.find((uid) => uid !== player1Id) ?? "";
  }
  return {player1Id, player2Id};
}

/**
 * Aplica a troca ao doc de equipe DENTRO da transação. Lê (as inscrições que
 * apontam para o doc) E escreve — chame depois de todas as outras leituras da
 * transação, e no máximo uma vez: o caminho do fork chama `resolvePairTeamTx`,
 * que também lê antes de escrever.
 */
export async function applySubstitutionToTeamTx(
  tx: Transaction,
  params: SubstitutionTeamParams,
): Promise<SubstitutionTeamOutcome> {
  const isPair = !params.namedTeam && isPairTeamDoc(params.team);

  // Quem mais aponta para este doc? Só a resposta separa "meu doc" de "doc que
  // eu divido com o outro torneio".
  let shared = false;
  if (isPair) {
    const referencing = await tx.get(
      params.inscriptionsRef.where("teamId", "==", params.teamId),
    );
    shared = referencing.docs.some((doc) => doc.id !== params.registrationId);
  }

  const {player1Id, player2Id} = pairAfterSubstitution(params);

  if (isPair && shared) {
    const resolved = await resolvePairTeamTx(tx, {
      teamsRef: params.teamsRef,
      inscriptionsRef: params.inscriptionsRef,
      tournamentId: params.tournamentId,
      player1Id,
      player2Id,
    });
    return {teamId: resolved.teamId, forked: true};
  }

  const teamUpdate: Record<string, unknown> = {
    memberUids: replaceUidInList(
      extractTeamMemberUids(params.team),
      params.outUid,
      params.inUid,
    ),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (trimmed(params.team.player1Id) === params.outUid) {
    teamUpdate.player1Id = params.inUid;
  }
  if (trimmed(params.team.player2Id) === params.outUid) {
    teamUpdate.player2Id = params.inUid;
  }
  if (isPair) {
    // Sem isto o doc fica com a chave da dupla ANTIGA: invisível para o par
    // novo e recusado na revalidação do par velho — os dois voltariam a criar
    // docs soltos, ressemeando a duplicação que esta entrega existe pra matar.
    const nextPairKey = buildPairKey(player1Id, player2Id);
    if (nextPairKey) teamUpdate.pairKey = nextPairKey;
  }
  tx.update(params.teamsRef.doc(params.teamId), teamUpdate);

  return {teamId: params.teamId, forked: false};
}
