/**
 * Identidade da dupla: um doc de equipe por par, reaproveitado a cada torneio.
 *
 * Antes, todo caminho de criação escrevia `{player1Id, player2Id, createdAt}`
 * novo — a mesma dupla em dois torneios virava duas identidades, e como
 * `teamRankings` é chaveado pelo id da equipe, o par aparecia duas vezes no
 * ranking com metade da história em cada entrada.
 *
 * A exceção é deliberada: o bloqueio de inscrição é por CATEGORIA, então o par
 * pode entrar em duas categorias do mesmo torneio. Ali nasce doc próprio, para
 * preservar "um teamId = uma chave" — invariante que os leitores de campanha e
 * jornada assumem ao filtrar partida por equipe sem olhar categoria.
 *
 * Equipe nomeada (trio/quarteto/quinteto) nunca passa por aqui: ela é escopada
 * ao torneio de propósito, com nome escolhido pelo capitão.
 *
 * Ver `docs/superpowers/specs/2026-09-15-identidade-unica-da-dupla-design.md`.
 */

import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import {buildPairKey} from "./tournament-pair-uniqueness";

export interface PairTeamCandidate {
  id: string;
  createdAtMs: number;
}

export interface PairTeamResolution {
  ref: DocumentReference;
  teamId: string;
  reused: boolean;
}

/**
 * Doc de equipe que representa uma DUPLA. Nome preenchido ou elenco de 3+ é
 * equipe nomeada e nunca deduplica.
 */
export function isPairTeamDoc(
  team: Record<string, unknown> | null | undefined,
): boolean {
  if (!team) return false;
  const name = typeof team.teamName === "string" ? team.teamName.trim() : "";
  if (name) return false;
  const size = Number(team.teamSize ?? 0);
  if (Number.isFinite(size) && size >= 3) return false;
  // `memberUids` é o elenco canônico no resto do código. Um doc histórico com
  // 3+ membros, sem nome e sem `teamSize`, passaria pelos dois testes acima e
  // seria tratado como dupla pelos 2 primeiros players.
  const memberUids = team.memberUids;
  if (Array.isArray(memberUids) && memberUids.length >= 3) return false;
  return true;
}

/**
 * Duplicado legado: o mais antigo vence. Determinístico (desempate pelo id) só
 * para as resoluções SEGUINTES concordarem — o Firestore não trava o intervalo
 * vazio de uma query transacional, então duas primeiras resoluções concorrentes
 * do mesmo par ainda podem criar dois docs. Isso não converge sozinho: quem
 * repara um par já dividido é o script de merge.
 */
export function pickPairTeamId(candidates: PairTeamCandidate[]): string {
  let best: PairTeamCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    if (
      best == null ||
      candidate.createdAtMs < best.createdAtMs ||
      (candidate.createdAtMs === best.createdAtMs && candidate.id < best.id)
    ) {
      best = candidate;
    }
  }
  return best?.id ?? "";
}

function toMillis(value: unknown): number {
  const maybe = value as {toMillis?: () => number} | null | undefined;
  if (maybe && typeof maybe.toMillis === "function") {
    const ms = maybe.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve a equipe da dupla DENTRO da transação: reaproveita o doc do par ou
 * cria um novo. Faz leitura E escrita — chame depois de todas as outras
 * leituras da transação.
 */
export async function resolvePairTeamTx(
  tx: Transaction,
  params: {
    teamsRef: CollectionReference;
    inscriptionsRef: CollectionReference;
    tournamentId: string;
    player1Id: string;
    player2Id: string;
  },
): Promise<PairTeamResolution> {
  if (!trimmed(params.tournamentId)) {
    throw new Error("resolvePairTeamTx exige tournamentId");
  }

  const player1Id = trimmed(params.player1Id);
  const player2Id = trimmed(params.player2Id);
  const pairKey = buildPairKey(player1Id, player2Id);

  // Par incompleto/inválido: sem chave não há o que deduplicar.
  if (!pairKey) {
    return createPairTeam(tx, params.teamsRef, {player1Id, player2Id, pairKey: ""});
  }

  const existing = await tx.get(params.teamsRef.where("pairKey", "==", pairKey));
  const candidates: PairTeamCandidate[] = [];
  for (const doc of existing.docs) {
    const data = doc.data();
    if (!isPairTeamDoc(data)) continue;
    // `pairKey` é índice, não prova: o cliente consegue gravar o campo, então a
    // identidade vale pelos player ids do próprio doc.
    if (buildPairKey(trimmed(data.player1Id), trimmed(data.player2Id)) !== pairKey) {
      continue;
    }
    candidates.push({id: doc.id, createdAtMs: toMillis(data.createdAt)});
  }

  const chosenId = pickPairTeamId(candidates);
  if (chosenId) {
    const taken = await tx.get(
      params.inscriptionsRef.where("teamId", "==", chosenId),
    );
    const alreadyInTournament = taken.docs.some(
      (doc) => trimmed(doc.data().tournamentId) === trimmed(params.tournamentId),
    );
    if (!alreadyInTournament) {
      const ref = params.teamsRef.doc(chosenId);
      // `pairKey` já bate — o candidato só chegou aqui por casar a query E a
      // revalidação. Regravá-lo seria um "backfill" que nunca dispara: um doc
      // sem `pairKey` é invisível pra query que o encontrou.
      tx.update(ref, {updatedAt: FieldValue.serverTimestamp()});
      return {ref, teamId: chosenId, reused: true};
    }
  }

  return createPairTeam(tx, params.teamsRef, {player1Id, player2Id, pairKey});
}

function createPairTeam(
  tx: Transaction,
  teamsRef: CollectionReference,
  data: {player1Id: string; player2Id: string; pairKey: string},
): PairTeamResolution {
  const ref = teamsRef.doc();
  tx.set(ref, {
    player1Id: data.player1Id,
    player2Id: data.player2Id,
    ...(data.pairKey ? {pairKey: data.pairKey} : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
  return {ref, teamId: ref.id, reused: false};
}
