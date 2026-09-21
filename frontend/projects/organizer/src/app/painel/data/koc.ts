/** King of the Court no portal.
 *
 *  Porta de `nexago_app/.../domain/koc/` (Flutter) e de
 *  `functions/src/koc-engine.ts` — a FONTE DA VERDADE é o backend: nada aqui
 *  calcula estado, só LÊ o que a callable gravou. Em especial o relógio: o
 *  servidor grava `endsAtMs` e o cliente apenas conta para trás, que é o que
 *  mantém mesa do app, mesa do portal e telão no mesmo relógio.
 *
 *  A rodada KOTC não tem dois lados: `teamAId`/`teamBId` vêm VAZIOS e o elenco
 *  vive em `kocTeamIds`. Quem lê os dois lados precisa sair antes por
 *  [isKingOfCourtMatchType]. */

/** Piso e teto do formato. */
export const KOC_MIN_TEAMS_PER_ROUND = 3;
export const KOC_MAX_TEAMS_PER_ROUND = 5;

export interface KocClock {
  /** Derivado NO SERVIDOR. O cliente nunca recalcula prazo. */
  endsAtMs: number;
  durationSec: number;
  /** Quando a pausa atual começou; nulo se está correndo. */
  pausedAtMs: number | null;
}

export interface KocStanding {
  teamId: string;
  place: number;
  points: number;
  crowns: number;
}

/** Entrada do log de rallies gravado em `kocRallies`. */
export interface KocRallyEntry {
  seq: number;
  /** Espelha `KocRallyOutcome` do servidor. Descartar um desfecho aqui não o
   *  "ignora": o log é reproduzido em sequência, então pular uma entrada
   *  desalinha o trono de todas as seguintes. */
  winner: 'king' | 'challenger' | 'serve_fault' | 'golden_point';
  /** Só em `golden_point`: a dupla que venceu a bola de ouro. */
  teamId: string;
  /** Epoch ms quando o rally foi registrado (opcional em docs antigos). */
  atMs: number | null;
}

/** Linha pronta pra UI do log da rodada. */
export interface KocLogLine {
  key: string;
  seq: number;
  atMs: number | null;
  teamId: string;
  /** `point` = rei defendeu; `crown` = desafiante coroou; `fault` = erro de
   *  saque do desafiante (perdeu a vez, sem ponto); `golden` = bola de ouro. */
  kind: 'point' | 'crown' | 'fault' | 'golden';
}

export interface KocRoundState {
  teamIds: string[];
  kingTeamId: string;
  challengerTeamId: string;
  queue: string[];
  points: Record<string, number>;
  rallies: number;
  servingTeamId: string;
  clock: KocClock | null;
  standings: KocStanding[];
  qualifiersPerRound: number;
  configuredDurationSec: number;
  /** Nº do último rally gravado — vai em `expectedSeq` no próximo. */
  rallySeq: number;
  /** Log bruto de rallies (`kocRallies`) — base do histórico da mesa. */
  rallyLog: KocRallyEntry[];
  /** Índice da rodada DENTRO da fase (1, 2, 3…), gravado pelo gerador.
   *  `matchNumber` é global e serviria só enquanto a primeira fase é a única
   *  classificatória — num campo com duas fases de classificatória ele diria
   *  "Rodada 5". */
  roundLabel: number;
  /** De onde vem cada vaga desta rodada — "1º Rodada 1", "2º Rodada 2"… É o que
   *  torna a chave legível antes de a fase anterior terminar, quando o elenco
   *  ainda não existe. */
  qualifierSlots: string[];
}

/** Rodada King of the Court, pelo prefixo do `matchType`.
 *
 *  Prefixo e não lista fechada, para que um tipo KOTC novo já nasça reconhecido
 *  em vez de cair no caminho de duelo. */
export function isKingOfCourtMatchType(matchType: string): boolean {
  return normalizeMatchType(matchType).startsWith('koc ');
}

/** Caixa baixa com `_` virando espaço — mesma normalização do backend. */
export function normalizeMatchType(matchType: string): string {
  return (matchType ?? '').trim().toLowerCase().replace(/_/g, ' ');
}

/** "Classificatória · Rodada 3" / "Semifinal" / "Final". */
export function kocPhaseLabel(matchType: string, matchNumber: number): string {
  const t = normalizeMatchType(matchType);
  if (t === 'koc final') return 'Final';
  if (t === 'koc semifinal') return 'Semifinal';
  // Numa quadra só as classificatórias acontecem em sequência: o número
  // responde "qual é a minha".
  return matchNumber > 0 ? `Classificatória · Rodada ${matchNumber}` : 'Classificatória';
}

/** Título do card/fila quando a partida é rodada KOTC — não há confronto A×B,
 *  então "A definir × A definir" não identifica nada. Prefere o `round` já
 *  montado no doc mapeado; senão recalcula pela fase. */
export function kocCardTitle(match: {
  matchType: string;
  round: string | null;
  matchNumber: number;
  koc?: { roundLabel: number } | null;
}): string | null {
  if (!isKingOfCourtMatchType(match.matchType)) return null;
  if (match.round) return match.round;
  const n = match.koc?.roundLabel || match.matchNumber;
  return kocPhaseLabel(match.matchType, n);
}

/** Troca entre rodadas, em minutos. Espelha `KOC_CHANGEOVER_MIN` do servidor
 *  (`functions/src/match-schedule-allocation.ts`): a duração configurada é o
 *  tempo de JOGO, e o slot de quadra precisa da troca também. O servidor impõe
 *  essa janela ao gravar — aqui é só pra tela não mostrar outro número. */
export const KOC_CHANGEOVER_MIN = 5;

/** Cabeçalho da COLUNA da chave: a fase, sem o número da rodada — a coluna
 *  reúne as rodadas daquela fase, e o número de cada uma vai no card. */
export function kocColumnLabel(matchType: string): string {
  const t = normalizeMatchType(matchType);
  if (t === 'koc final') return 'Final';
  if (t === 'koc semifinal') return 'Semifinal';
  return 'Classificatória';
}

function intOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function strOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function teamIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(strOf).filter((id) => id.length > 0);
}

function pointsOf(value: unknown): Record<string, number> {
  if (value == null || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = Math.trunc(raw);
  }
  return out;
}

function clockOf(value: unknown): KocClock | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw['endsAtMs'] !== 'number') return null;
  const paused = raw['pausedAtMs'];
  return {
    endsAtMs: raw['endsAtMs'],
    durationSec: intOf(raw['durationSec'], 900),
    pausedAtMs: typeof paused === 'number' && paused > 0 ? paused : null,
  };
}

function qualifierSlotsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const description = strOf((item as Record<string, unknown>)['description']);
    if (description) out.push(description);
  }
  return out;
}

function standingsOf(value: unknown): KocStanding[] {
  if (!Array.isArray(value)) return [];
  const out: KocStanding[] = [];
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const teamId = strOf(raw['teamId']);
    const place = intOf(raw['place'], 0);
    if (!teamId || place < 1) continue;
    out.push({ teamId, place, points: intOf(raw['points']), crowns: intOf(raw['crowns']) });
  }
  return out.sort((a, b) => a.place - b.place);
}

function isRallyOutcome(value: string): value is KocRallyEntry['winner'] {
  return value === 'king' || value === 'challenger' ||
    value === 'serve_fault' || value === 'golden_point';
}

function rallyLogOf(value: unknown): KocRallyEntry[] {
  if (!Array.isArray(value)) return [];
  const out: KocRallyEntry[] = [];
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const seq = intOf(raw['seq'], 0);
    const winner = strOf(raw['winner']);
    if (seq < 1 || !isRallyOutcome(winner)) continue;
    const at = raw['atMs'];
    out.push({
      seq,
      winner,
      teamId: strOf(raw['teamId']),
      atMs: typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.trunc(at) : null,
    });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/** Lê a rodada do doc de `matches`.
 *
 *  Tolerante por escolha: campo ausente ou corrompido vira vazio em vez de
 *  exceção. Mesa e telão não podem ficar sem tela por um campo torto — o
 *  servidor é quem valida antes de gravar. */
export function kocRoundStateFrom(data: Record<string, unknown>): KocRoundState {
  const state = (data['kocState'] ?? {}) as Record<string, unknown>;
  const config = (data['kocConfig'] ?? {}) as Record<string, unknown>;
  return {
    teamIds: teamIdsOf(data['kocTeamIds']),
    kingTeamId: strOf(state['kingTeamId']),
    challengerTeamId: strOf(state['challengerTeamId']),
    queue: teamIdsOf(state['queue']),
    points: pointsOf(state['points']),
    rallies: intOf(state['rallies']),
    servingTeamId: strOf(state['servingTeamId']),
    clock: clockOf(data['kocClock']),
    standings: standingsOf(data['kocStandings']),
    qualifiersPerRound: intOf(config['qualifiersPerRound'], 2),
    configuredDurationSec: intOf(config['durationSec'], 900),
    rallySeq: intOf(data['kocRallySeq']),
    rallyLog: rallyLogOf(data['kocRallies']),
    roundLabel: intOf(data['kocRoundLabel']),
    qualifierSlots: qualifierSlotsOf(data['kocQualifiers']),
  };
}

export function kocHasStarted(round: KocRoundState): boolean {
  return round.clock != null;
}

export function kocPointsOf(round: KocRoundState, teamId: string): number {
  return round.points[teamId] ?? 0;
}

/** Segundos restantes. Em pausa, congela onde parou. */
export function kocRemainingSec(clock: KocClock, nowMs: number): number {
  const reference = clock.pausedAtMs ?? nowMs;
  return Math.max(0, Math.ceil((clock.endsAtMs - reference) / 1000));
}

export function kocIsExpired(clock: KocClock, nowMs: number): boolean {
  return kocRemainingSec(clock, nowMs) === 0;
}

/** "12:05" — o formato que a mesa lê de relance. */
export function kocRemainingLabel(clock: KocClock, nowMs: number): string {
  const total = kocRemainingSec(clock, nowMs);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Tabela ao vivo: pontos, depois a ordem de entrada como desempate
 *  determinístico. A tabela OFICIAL é a que `kocFinishRound` grava. */
export function kocLiveOrder(round: KocRoundState): string[] {
  return [...round.teamIds].sort((a, b) => {
    const byPoints = kocPointsOf(round, b) - kocPointsOf(round, a);
    if (byPoints !== 0) return byPoints;
    return round.teamIds.indexOf(a) - round.teamIds.indexOf(b);
  });
}

/** Tabela final da rodada encerrada.
 *
 *  `kocStandings` só é gravado no encerramento; uma rodada encerrada por um
 *  caminho antigo cai na ordem por pontos, em vez de a mesa ficar vazia. Espelha
 *  `KocRoundState.finalTable` do app — as duas mesas mostram a MESMA tabela. */
export function kocFinalTable(round: KocRoundState): KocStanding[] {
  if (round.standings.length > 0) return round.standings;
  return kocLiveOrder(round).map((teamId, i) => ({
    teamId,
    place: i + 1,
    points: kocPointsOf(round, teamId),
    crowns: 0,
  }));
}

/** Duplas empatadas em pontos com [teamId]. */
export function kocTiedWith(round: KocRoundState, teamId: string): string[] {
  const mine = kocPointsOf(round, teamId);
  return round.teamIds.filter((id) => id !== teamId && kocPointsOf(round, id) === mine);
}

/** O empate atravessa o corte de classificação — onde a bola de ouro é devida.
 *  Mesma regra de `kocQualifyingTies` no servidor. */
export function kocHasQualifyingTie(round: KocRoundState): boolean {
  return kocQualifyingTieGroup(round).length > 0;
}

/** Duplas que disputam a vaga no empate — as que jogam a bola de ouro.
 *
 *  Com poucos rallies (uma rodada de 15 min produz poucos) o empate no corte é
 *  o caso COMUM, e costuma envolver mais de duas duplas: todas as que estão na
 *  mesma pontuação da última vaga entram. Espelha `kocQualifyingTies` do
 *  servidor, que é quem valida a bola de ouro. */
export function kocQualifyingTieGroup(round: KocRoundState): string[] {
  const order = kocLiveOrder(round);
  const cut = round.qualifiersPerRound;
  if (cut < 1 || cut >= order.length) return [];
  const lastIn = kocPointsOf(round, order[cut - 1]);
  if (lastIn !== kocPointsOf(round, order[cut])) return [];
  const tied = order.filter((teamId) => kocPointsOf(round, teamId) === lastIn);
  return tied.length > 1 ? tied : [];
}

/**
 * Reconstrói o log da mesa a partir do array de rallies.
 *
 * Espelha `kocApplyRally` do backend: só o rei pontua; o desafiante que vence
 * coroa sem ponto. Devolve do mais recente pro mais antigo (como o protótipo).
 */
export function kocLogLines(round: KocRoundState): KocLogLine[] {
  const roster = round.teamIds;
  if (roster.length < 3 || round.rallyLog.length === 0) return [];

  let king = roster[0]!;
  let challenger = roster[1]!;
  let queue = roster.slice(2);
  const lines: KocLogLine[] = [];

  for (const entry of round.rallyLog) {
    const base = {key: `r${entry.seq}`, seq: entry.seq, atMs: entry.atMs};

    // A bola de ouro é jogada DEPOIS do apito, entre as empatadas: ela aponta
    // uma dupla e não mexe na fila. Girar aqui desalinharia o trono do resto.
    if (entry.winner === 'golden_point') {
      lines.push({...base, teamId: entry.teamId, kind: 'golden'});
      continue;
    }
    if (entry.winner === 'serve_fault') {
      // Sem ponto: quem errou o saque perde a vez e volta pro fim da fila.
      lines.push({...base, teamId: challenger, kind: 'fault'});
      queue = [...queue, challenger];
      challenger = queue.shift() ?? '';
      continue;
    }
    if (entry.winner === 'king') {
      lines.push({...base, teamId: king, kind: 'point'});
      queue = [...queue, challenger];
      challenger = queue.shift() ?? '';
      continue;
    }
    lines.push({...base, teamId: challenger, kind: 'crown'});
    queue = [...queue, king];
    king = challenger;
    challenger = queue.shift() ?? '';
  }

  return lines.reverse();
}
