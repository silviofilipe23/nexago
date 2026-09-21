import { collection, deleteField, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { applyPoint, liveSetToMap, undoPoint, type ApplyPointResult, type LiveSet } from './live-scoring';
import { setsWon } from './match-scoring';
import { statusOf, type MatchDisplayStatus } from './match-status';
import {
  MEDICAL_TIMEOUT_SECONDS,
  canRequestMedicalTimeout,
  medicalTimeoutFromRaw,
  medicalTimeoutPlayerKey,
  medicalTimeoutPlayerKeysFromRaw,
  type MedicalTimeout,
} from './medical-timeout';
import {
  servingPlayerSlotOf,
  servingPlayerSlotsAfterScore,
  servingPlayerSlotsAfterUndo,
  servingPlayerSlotsFromRaw,
  type MatchSide,
  type ServingPlayerSlot,
  type ServingPlayerSlots,
} from './serving-player';

/** Leitura/escrita da MESA AO VIVO — espelha `TournamentMatchesRepository` do app
 *  (`tournament_matches_repository.dart`): a marcação ponto a ponto escreve DIRETO no doc da
 *  partida em transação (permitido pelas rules ao dono/staff via `managerCanOnlyEditMatchFields`
 *  / `scorerCanOnlyEditScoreFields`), gravando junto o evento em `pointEvents` com `seq`
 *  sequencial validado pelas rules (`seq == pointEventSeq + 1`). O avanço de chave continua
 *  sendo do servidor: o trigger `onTournamentMatchCompletedAdvance` dispara quando o ponto
 *  final grava `status: Completed` + `winnerId`.
 *
 *  Compartilhado entre o portal do organizador e o do atleta (mesário opera pelos dois): a
 *  instância do Firestore e o `projectId` chegam por parâmetro em vez de virem do
 *  `environment` de um portal específico. */

/** Firestore + projectId do portal que está usando a mesa — cada app monta o seu
 *  (`organizerLiveScoringContext()` / `athleteLiveScoringContext()`). */
export interface LiveScoringContext {
  db: Firestore;
  projectId: string;
}

/** Recorte do doc que a mesa usa — campos crus, sem os rótulos resolvidos (nomes de dupla vêm
 *  do contexto de cada portal). */
export interface LiveMatch {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamAId: string;
  teamBId: string;
  teamADescription: string | null;
  teamBDescription: string | null;
  status: MatchDisplayStatus;
  /** Identificação da partida na planta — a mesa usa pra rotular a fase no cabeçalho
   *  ("Semifinal", "Grupo A"). Cru como `category-bracket-builders.ts` grava. */
  matchType: string;
  round: number;
  poolId: string;
  matchNumber: number;
  sets: LiveSet[];
  currentSetIndex: number;
  bestOf: 1 | 3;
  servingTeamId: string;
  /** Posição (1 ou 2) do atleta no saque dentro da dupla de `servingTeamId`; 0 = não declarada.
   *  Ver `serving-player.ts` — é derivada de [servingPlayerSlots] e vem denormalizada no doc
   *  pra quem só exibe (telão, cards) não precisar saber o lado. */
  servingPlayerSlot: ServingPlayerSlot;
  /** A ordem de saque declarada por cada dupla no set corrente. */
  servingPlayerSlots: ServingPlayerSlots;
  /** Atendimento médico em andamento — `null` quando ninguém está sendo atendido. */
  medicalTimeout: MedicalTimeout | null;
  /** Atletas que já usaram o tempo médico nesta partida ("A1", "B2"). */
  medicalTimeoutPlayers: string[];
  matchStartedAt: Date | null;
  winnerId: string | null;
  courtName: string | null;
  scheduleTime: Date | null;
}

export interface LivePointEvent {
  id: string;
  seq: number;
  type: string;
  side: 'A' | 'B' | null;
  setIndex: number;
  scoreA: number;
  scoreB: number;
  ts: Date | null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function intOf(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

/** Sets com `startedAt`/`endedAt` repassados crus — a mesa devolve esses valores ao doc ao
 *  reescrever o array inteiro (o app faz o mesmo via `TournamentMatchSet.toMap`). */
function liveSetsFromRaw(raw: unknown): LiveSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const o = s as Record<string, unknown>;
      const a = typeof o['a'] === 'number' ? o['a'] : null;
      const b = typeof o['b'] === 'number' ? o['b'] : null;
      if (a == null || b == null) return null;
      const set: LiveSet = { a, b };
      if (o['startedAt'] != null) set.startedAt = o['startedAt'];
      if (o['endedAt'] != null) set.endedAt = o['endedAt'];
      return set;
    })
    .filter((s): s is LiveSet => s != null);
}

export function liveMatchFromDoc(id: string, data: Record<string, unknown>): LiveMatch {
  const sets = liveSetsFromRaw(data['sets']);
  return {
    id,
    tournamentId: optionalStr(data['tournamentId']) ?? '',
    categoryId: optionalStr(data['categoryId']),
    teamAId: optionalStr(data['teamAId']) ?? '',
    teamBId: optionalStr(data['teamBId']) ?? '',
    teamADescription: optionalStr(data['teamADescription']),
    teamBDescription: optionalStr(data['teamBDescription']),
    status: statusOf(data['status']),
    matchType: optionalStr(data['matchType']) ?? '',
    round: typeof data['round'] === 'number' ? data['round'] : 0,
    poolId: optionalStr(data['poolId']) ?? '',
    matchNumber: typeof data['matchNumber'] === 'number' ? data['matchNumber'] : 0,
    sets,
    // Partida antiga sem `currentSetIndex` cai no último set do array (mesmo fallback do app).
    currentSetIndex: intOf(data['currentSetIndex'], Math.max(0, sets.length - 1)),
    bestOf: data['bestOf'] === 1 ? 1 : 3,
    servingTeamId: optionalStr(data['servingTeamId']) ?? '',
    servingPlayerSlot: data['servingPlayerSlot'] === 1 || data['servingPlayerSlot'] === 2 ? data['servingPlayerSlot'] : 0,
    servingPlayerSlots: servingPlayerSlotsFromRaw(data['servingPlayerSlots']),
    medicalTimeout: medicalTimeoutFromRaw(data['medicalTimeout']),
    medicalTimeoutPlayers: medicalTimeoutPlayerKeysFromRaw(data['medicalTimeoutPlayers']),
    matchStartedAt: toDate(data['matchStartedAt']),
    winnerId: optionalStr(data['winnerId']),
    courtName: optionalStr(data['courtName']),
    scheduleTime: toDate(data['scheduleTime']),
  };
}

function matchesCol(ctx: LiveScoringContext) {
  if (!ctx.projectId) throw new Error('Firebase projectId ausente no environment.');
  return collection(ctx.db, 'artifacts', ctx.projectId, 'public', 'data', 'matches');
}

export function watchLiveMatch(ctx: LiveScoringContext, matchId: string, onChange: (match: LiveMatch | null) => void, onError?: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    doc(matchesCol(ctx), matchId),
    (snap) => onChange(snap.exists() ? liveMatchFromDoc(snap.id, snap.data() as Record<string, unknown>) : null),
    (err) => onError?.(err),
  );
}

export function watchPointEvents(ctx: LiveScoringContext, matchId: string, onChange: (events: LivePointEvent[]) => void, onError?: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    query(collection(doc(matchesCol(ctx), matchId), 'pointEvents'), orderBy('seq')),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const o = d.data() as Record<string, unknown>;
          const side = optionalStr(o['side'])?.toUpperCase();
          return {
            id: d.id,
            seq: intOf(o['seq'], 0),
            type: optionalStr(o['type']) ?? '',
            side: side === 'A' || side === 'B' ? side : null,
            setIndex: intOf(o['setIndex'], 0),
            scoreA: intOf(o['scoreA'], 0),
            scoreB: intOf(o['scoreB'], 0),
            ts: toDate(o['ts']),
          };
        }),
      ),
    (err) => onError?.(err),
  );
}

/** O que uma marcação escreve: os campos do doc da partida e o evento da timeline, mais o
 *  resultado do motor pra tela reagir (encerrou a partida? virou o set?). */
export interface PointWrite {
  matchUpdate: Record<string, unknown>;
  pointEvent: Record<string, unknown>;
  result: ApplyPointResult;
  /** Set em que a marcação caiu — é o `setIndex` gravado no evento. */
  setIndex: number;
}

/** `currentSetIndex` do doc preso ao formato — partida antiga pode trazer índice fora da faixa. */
function clampedSetIndex(m: Pick<LiveMatch, 'currentSetIndex' | 'bestOf'>): number {
  return Math.min(Math.max(m.currentSetIndex, 0), m.bestOf - 1);
}

/** Monta a escrita de UM ponto a partir do doc — as três mesas (organizador, portal do atleta e
 *  app) gravam exatamente estes campos. Recebe o doc em vez de calcular na tela porque quem
 *  chama é a transação, com a versão fresca em mãos (ver `recordPointTransaction`).
 *
 *  Devolve `null` quando a partida já está encerrada no doc: nesse caso a outra mesa (ou o
 *  ponto anterior) fechou a partida enquanto esta tela ainda mostrava "ao vivo", e somar ponto
 *  em partida encerrada reabriria uma chave que o servidor já avançou. */
export function buildPointWrite(m: LiveMatch, side: 'A' | 'B'): PointWrite | null {
  if (m.status === 'completed') return null;

  const setIndex = clampedSetIndex(m);
  const result = applyPoint({ sets: m.sets, currentSetIndex: m.currentSetIndex, side, teamAId: m.teamAId, teamBId: m.teamBId, bestOf: m.bestOf });
  const wins = setsWon(result.sets, m.bestOf);
  const current = result.sets[setIndex] ?? null;
  const slots = servingPlayerSlotsAfterScore({
    slots: m.servingPlayerSlots,
    previousServingTeamId: m.servingTeamId,
    nextServingTeamId: result.servingTeamId,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
  });

  return {
    matchUpdate: {
      sets: result.sets.map(liveSetToMap),
      currentSetIndex: result.currentSetIndex,
      status: result.winnerId != null ? 'Completed' : 'In Progress',
      servingTeamId: result.servingTeamId,
      servingPlayerSlots: slots,
      servingPlayerSlot: servingPlayerSlotOf({ slots, servingTeamId: result.servingTeamId, teamAId: m.teamAId, teamBId: m.teamBId }),
      ...(result.winnerId != null ? { winnerId: result.winnerId, matchEndedAt: serverTimestamp() } : {}),
      ...(m.matchStartedAt == null ? { matchStartedAt: serverTimestamp() } : {}),
      resultA: `${wins.a}`,
      resultB: `${wins.b}`,
    },
    pointEvent: { type: 'point', side, setIndex, scoreA: current?.a ?? 0, scoreB: current?.b ?? 0 },
    result,
    setIndex,
  };
}

/** Escrita do "desfazer": tira o ponto do lado que o marcou, no set do evento desfeito.
 *  `setIndex` vem da timeline (identifica QUAL ponto sai); o placar sai do doc recebido. */
export function buildUndoWrite(m: LiveMatch, side: 'A' | 'B', setIndex: number): PointWrite {
  const result = undoPoint({ sets: m.sets, currentSetIndex: setIndex, side, teamAId: m.teamAId, teamBId: m.teamBId, bestOf: m.bestOf });
  const wins = setsWon(result.sets, m.bestOf);
  const current = result.sets[result.currentSetIndex] ?? null;
  const slots = servingPlayerSlotsAfterUndo({ slots: m.servingPlayerSlots, nextServingTeamId: result.servingTeamId });

  return {
    matchUpdate: {
      sets: result.sets.map(liveSetToMap),
      currentSetIndex: result.currentSetIndex,
      status: 'In Progress',
      servingTeamId: result.servingTeamId,
      servingPlayerSlots: slots,
      servingPlayerSlot: servingPlayerSlotOf({ slots, servingTeamId: result.servingTeamId, teamAId: m.teamAId, teamBId: m.teamBId }),
      winnerId: deleteField(),
      matchEndedAt: deleteField(),
      resultA: `${wins.a}`,
      resultB: `${wins.b}`,
    },
    pointEvent: { type: 'undo-point', side, setIndex: result.currentSetIndex, scoreA: current?.a ?? 0, scoreB: current?.b ?? 0 },
    result: { ...result, winnerId: null },
    setIndex: result.currentSetIndex,
  };
}

/** Campos de uma troca MANUAL da dupla no saque ("Quem começa sacando?" e "Trocar saque").
 *  Não mexe na ordem declarada de cada dupla — só reaponta quem está sacando agora, que é o
 *  atleta que aquela dupla já tinha na vez. */
export function servingTeamFields(m: LiveMatch, teamId: string): Record<string, unknown> {
  return {
    servingTeamId: teamId,
    servingPlayerSlot: servingPlayerSlotOf({ slots: m.servingPlayerSlots, servingTeamId: teamId, teamAId: m.teamAId, teamBId: m.teamBId }),
  };
}

/** Campos de "quem saca pela dupla X" — a faixa que aparece quando `needsServingPlayer`, e
 *  também o "Trocar sacador" (que manda a outra posição). */
export function servingPlayerFields(m: LiveMatch, side: MatchSide, slot: 1 | 2): Record<string, unknown> {
  const slots: ServingPlayerSlots = { ...m.servingPlayerSlots, [side]: slot };
  return {
    servingPlayerSlots: slots,
    servingPlayerSlot: servingPlayerSlotOf({ slots, servingTeamId: m.servingTeamId, teamAId: m.teamAId, teamBId: m.teamBId }),
  };
}

/** Abre o tempo médico de um atleta: grava o atendimento em andamento, marca a cota do atleta
 *  como usada e registra o chamado na timeline (é o que sobra de auditoria depois que o
 *  atendimento termina e o campo some do doc).
 *
 *  `null` quando o atleta já usou o dele, quando outro atendimento está rolando ou quando a
 *  partida já encerrou — a mesma guarda do ponto, avaliada sobre o doc FRESCO da transação. */
export function buildMedicalTimeoutStartWrite(m: LiveMatch, params: { side: MatchSide; playerSlot: 1 | 2; playerName: string }): PointWrite | null {
  if (m.status === 'completed' || m.status === 'canceled') return null;
  if (!canRequestMedicalTimeout({ usedKeys: m.medicalTimeoutPlayers, active: m.medicalTimeout, side: params.side, slot: params.playerSlot })) return null;

  const setIndex = clampedSetIndex(m);
  const current = m.sets[setIndex] ?? null;
  const teamId = params.side === 'A' ? m.teamAId : m.teamBId;

  return {
    matchUpdate: {
      medicalTimeout: {
        side: params.side,
        teamId,
        playerSlot: params.playerSlot,
        playerName: params.playerName,
        // Carimbo do SERVIDOR: é ele que faz app, mesas web e telão mostrarem a mesma
        // contagem sem nenhuma escrita durante os 5 minutos (ver `medical-timeout.ts`).
        startedAt: serverTimestamp(),
        durationSec: MEDICAL_TIMEOUT_SECONDS,
        setIndex,
      },
      medicalTimeoutPlayers: [...m.medicalTimeoutPlayers, medicalTimeoutPlayerKey(params.side, params.playerSlot)],
    },
    pointEvent: {
      type: 'medical-timeout',
      side: params.side,
      setIndex,
      scoreA: current?.a ?? 0,
      scoreB: current?.b ?? 0,
      playerSlot: params.playerSlot,
    },
    result: { sets: m.sets, currentSetIndex: m.currentSetIndex, winnerId: null, servingTeamId: m.servingTeamId },
    setIndex,
  };
}

/** Encerra o atendimento (pelo mesário, com ou sem os 5 minutos cheios) — o campo sai do doc e
 *  a mesa volta a marcar ponto. A cota do atleta NÃO volta: chamado é chamado. */
export function buildMedicalTimeoutEndWrite(m: LiveMatch): PointWrite | null {
  const active = m.medicalTimeout;
  if (!active) return null;

  const setIndex = clampedSetIndex(m);
  const current = m.sets[setIndex] ?? null;

  return {
    matchUpdate: { medicalTimeout: deleteField() },
    pointEvent: {
      type: 'medical-timeout-end',
      side: active.side,
      setIndex,
      scoreA: current?.a ?? 0,
      scoreB: current?.b ?? 0,
      playerSlot: active.playerSlot,
    },
    result: { sets: m.sets, currentSetIndex: m.currentSetIndex, winnerId: null, servingTeamId: m.servingTeamId },
    setIndex,
  };
}

/** Transação idêntica à do app (`recordPointTransaction`): atualiza o doc da partida e grava o
 *  evento com `seq = pointEventSeq + 1` no MESMO commit — as rules validam a sequência, então
 *  duas mesas concorrentes não conseguem gravar o mesmo seq.
 *
 *  O placar é montado AQUI DENTRO, pelo `build`, sobre o doc que a transação acabou de ler — e
 *  nunca a partir do que a tela tem em mãos. Transação do Firestore não tem latency
 *  compensation: o commit não aparece no cache local, e o listener só recebe a versão nova
 *  quando a watch stream entrega, o que acontece DEPOIS desta promise resolver. Montando o
 *  payload na tela, dois toques dentro dessa janela partiam do mesmo placar e gravavam o mesmo
 *  `scoreA`/`scoreB` — o segundo ainda sobrescrevia `sets` com o valor antigo, então o ponto se
 *  perdia de verdade (não era só evento repetido na timeline). Lendo aqui, o controle otimista
 *  do Firestore fecha o resto: se o doc mudar entre a leitura e o commit, a transação REPETE o
 *  `build` sobre o estado novo. */
export async function recordPointTransaction(ctx: LiveScoringContext, params: { matchId: string; build: (match: LiveMatch) => PointWrite | null }): Promise<PointWrite | null> {
  const matchRef = doc(matchesCol(ctx), params.matchId);
  // Holder em vez de `let`: a atribuição acontece dentro do callback da transação, que roda de
  // novo a cada retry — o valor que interessa é o da última passada.
  const out: { written: PointWrite | null } = { written: null };

  await runTransaction(ctx.db, async (txn) => {
    const snap = await txn.get(matchRef);
    if (!snap.exists()) throw new Error('Partida não encontrada');
    const data = snap.data() as Record<string, unknown>;

    const written = params.build(liveMatchFromDoc(snap.id, data));
    out.written = written;
    if (!written) return;

    const nextSeq = intOf(data['pointEventSeq'], 0) + 1;
    const eventRef = doc(collection(matchRef, 'pointEvents'));
    txn.update(matchRef, { ...written.matchUpdate, pointEventSeq: nextSeq, updatedAt: serverTimestamp() });
    txn.set(eventRef, { ...written.pointEvent, seq: nextSeq, ts: serverTimestamp() });
  });

  return out.written;
}

/** Escrita simples de campos permitidos pelas rules (troca de saque, troca de formato). */
export function updateMatchFields(ctx: LiveScoringContext, matchId: string, fields: Record<string, unknown>): Promise<void> {
  return updateDoc(doc(matchesCol(ctx), matchId), { ...fields, updatedAt: serverTimestamp() });
}

/** Último ponto ainda não desfeito: replay da timeline casando cada `undo-point` com o `point`
 *  mais recente. (O app usa o último evento `point` cru — aqui o replay evita que dois
 *  "desfazer" seguidos revertam o mesmo lado duas vezes.) */
export function lastUndoablePoint(events: readonly LivePointEvent[]): LivePointEvent | null {
  const stack: LivePointEvent[] = [];
  for (const e of events) {
    if (e.type === 'point') stack.push(e);
    else if (e.type === 'undo-point') stack.pop();
  }
  return stack[stack.length - 1] ?? null;
}
