import { needsStartingServe } from './live-scoring';
import type { MatchDisplayStatus } from './match-status';

/** QUAL ATLETA da dupla está sacando — o andar de baixo do `servingTeamId`.
 *
 *  O doc da partida não conhece atleta, só `teamAId`/`teamBId`, e a mesa roda a escrita do
 *  ponto DENTRO de uma transação que lê apenas esse doc. Por isso o saque individual é gravado
 *  como POSIÇÃO na dupla (1 ou 2), nunca como uid: a posição é a mesma ordem de
 *  `player1Id`/`player2Id` do doc em `teams`, que é a ordem em que as três mesas, o telão e os
 *  cards do app já listam os dois atletas ("Bruno / Lucas"). Quem exibe resolve o nome com o
 *  doc da dupla que JÁ carregou para escrever o rótulo — sem join novo — e o motor continua
 *  puro, sem precisar do elenco dentro da transação.
 *
 *  Espelhado em `match_serving_player_logic.dart` (mesa I1 do app). */

export type MatchSide = 'A' | 'B';

/** `0` = a equipe ainda não declarou quem abre o saque dela neste set. 1–5 = posição no elenco
 *  (individual só tem o 1; dupla 1–2; equipe até 5 — multiesporte fase 4b2). */
export type ServingPlayerSlot = 0 | 1 | 2 | 3 | 4 | 5;

/** Atletas por lado (1 individual, 2 dupla, 3–5 equipe). Ausente = dupla, como sempre foi. */
export interface RosterSizes {
  A: number;
  B: number;
}

export const DUPLA_ROSTER_SIZES: RosterSizes = { A: 2, B: 2 };

function rosterOf(sizes: RosterSizes | undefined, side: MatchSide): number {
  const n = sizes?.[side] ?? 2;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 2;
}

/** Próximo da ordem de saque do elenco: individual fica no 1, dupla alterna, equipe roda. */
function nextSlotInRoster(current: ServingPlayerSlot, roster: number): ServingPlayerSlot {
  if (current === 0) return 0;
  return ((current % roster) + 1) as ServingPlayerSlot;
}

export interface ServingPlayerSlots {
  A: ServingPlayerSlot;
  B: ServingPlayerSlot;
}

export const NO_SERVING_PLAYER_SLOTS: ServingPlayerSlots = { A: 0, B: 0 };

function slotOf(raw: unknown): ServingPlayerSlot {
  return raw === 1 || raw === 2 || raw === 3 || raw === 4 || raw === 5 ? raw : 0;
}

/** Lê o par de posições como o doc grava (`{ A: 1, B: 2 }`), tolerando doc antigo sem campo. */
export function servingPlayerSlotsFromRaw(raw: unknown): ServingPlayerSlots {
  if (!raw || typeof raw !== 'object') return { ...NO_SERVING_PLAYER_SLOTS };
  const o = raw as Record<string, unknown>;
  return { A: slotOf(o['A']), B: slotOf(o['B']) };
}

export function sideOfTeam(teamId: string, teamAId: string, teamBId: string): MatchSide | null {
  const id = teamId.trim();
  if (id === '') return null;
  if (id === teamAId.trim()) return 'A';
  if (id === teamBId.trim()) return 'B';
  return null;
}

/** A posição de quem está sacando AGORA — derivada do lado que está com o saque. Individual não
 *  tem o que declarar: o atleta no saque é sempre o 1. */
export function servingPlayerSlotOf(params: {
  slots: ServingPlayerSlots;
  servingTeamId: string;
  teamAId: string;
  teamBId: string;
  rosterSizes?: RosterSizes;
}): ServingPlayerSlot {
  const side = sideOfTeam(params.servingTeamId, params.teamAId, params.teamBId);
  if (side == null) return 0;
  return rosterOf(params.rosterSizes, side) === 1 ? 1 : params.slots[side];
}

/** Quem saca pela dupla depois de mexer no placar.
 *
 *  Regra do vôlei de praia: dentro do set a dupla mantém a ORDEM de saque declarada, então
 *  quando o saque volta pra ela quem vai à linha é o PARCEIRO de quem sacou por último. Enquanto
 *  a mesma dupla segue sacando, continua o mesmo atleta. E na virada de set tudo zera — a ordem
 *  é declarada de novo a cada set, igual ao `servingTeamId`, que também volta a `''` ali.
 *
 *  A dupla que ainda está em `0` não vira nada: ela nunca sacou neste set, e é a faixa
 *  [needsServingPlayer] que vai perguntar ao mesário quem abre. */
export function servingPlayerSlotsAfterScore(params: {
  slots: ServingPlayerSlots;
  previousServingTeamId: string;
  nextServingTeamId: string;
  teamAId: string;
  teamBId: string;
  rosterSizes?: RosterSizes;
}): ServingPlayerSlots {
  const { slots, teamAId, teamBId } = params;
  const previous = params.previousServingTeamId.trim();
  const next = params.nextServingTeamId.trim();

  if (next === '') return { ...NO_SERVING_PLAYER_SLOTS };
  if (previous === '' || previous === next) return { ...slots };

  const side = sideOfTeam(next, teamAId, teamBId);
  if (side == null) return { ...slots };
  const current = slots[side];
  if (current === 0) return { ...slots };
  return { ...slots, [side]: nextSlotInRoster(current, rosterOf(params.rosterSizes, side)) };
}

/** Desfazer NÃO devolve a ordem de saque: o evento da timeline guarda o placar, não quem estava
 *  com o saque antes do rally, e o `servingTeamId` do desfazer já é uma reconstrução aproximada
 *  (ver `undoPoint`). Então aqui só se mantém o que estava — e a mesa tem "Trocar sacador" pro
 *  mesário acertar na mão quando o desfazer cair numa virada de saque.
 *
 *  A única coisa que o desfazer resolve sozinho é a volta pra um set já fechado: sem dupla no
 *  saque não existe atleta no saque, e a ordem do próximo set é declarada do zero. */
export function servingPlayerSlotsAfterUndo(params: { slots: ServingPlayerSlots; nextServingTeamId: string }): ServingPlayerSlots {
  if (params.nextServingTeamId.trim() === '') return { ...NO_SERVING_PLAYER_SLOTS };
  return { ...params.slots };
}

/** Troca o sacador da dupla que está com o saque (ação manual da mesa). Sem dupla no saque, ou
 *  com a dupla ainda sem ordem declarada, não há o que trocar. */
export function swappedServingPlayerSlots(params: {
  slots: ServingPlayerSlots;
  servingTeamId: string;
  teamAId: string;
  teamBId: string;
  rosterSizes?: RosterSizes;
}): ServingPlayerSlots {
  const side = sideOfTeam(params.servingTeamId, params.teamAId, params.teamBId);
  if (side == null) return { ...params.slots };
  const current = params.slots[side];
  if (current === 0) return { ...params.slots };
  return { ...params.slots, [side]: nextSlotInRoster(current, rosterOf(params.rosterSizes, side)) };
}

/** Declara quem abre o saque da dupla de um lado — o que a faixa "Quem saca?" grava. */
export function withServingPlayerSlot(slots: ServingPlayerSlots, side: MatchSide, slot: Exclude<ServingPlayerSlot, 0>): ServingPlayerSlots {
  return { ...slots, [side]: slot };
}

/** A mesa precisa perguntar QUAL ATLETA está sacando?
 *
 *  Só depois de a DUPLA estar definida: enquanto `needsStartingServe` é verdade a faixa da vez é
 *  a do time, e duas perguntas juntas na mesma mesa viram ruído. Fora disso vale sempre que a
 *  dupla no saque ainda não declarou a ordem dela neste set — inclusive com a partida já ao
 *  vivo, porque a dupla que ainda não tinha sacado estreia no meio do set.
 *
 *  Espelha a janela de `needsStartingServe`: cala em partida encerrada/cancelada e enquanto a
 *  chave não definiu os dois lados. */
export function needsServingPlayer(params: {
  servingTeamId: string;
  servingPlayerSlot: ServingPlayerSlot;
  status: MatchDisplayStatus;
  teamAId: string;
  teamBId: string;
  /** Elenco do lado no saque: individual (1) nunca pergunta — só há um atleta. */
  servingRosterSize?: number;
}): boolean {
  const { servingTeamId, status, teamAId, teamBId } = params;
  if (params.servingRosterSize === 1) return false;
  if (needsStartingServe({ servingTeamId, status, teamAId, teamBId })) return false;
  if (status === 'completed' || status === 'canceled') return false;
  if (teamAId.trim() === '' || teamBId.trim() === '') return false;
  if (servingTeamId.trim() === '') return false;
  return params.servingPlayerSlot === 0;
}
