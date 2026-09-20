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

/** Duplas empatadas em pontos com [teamId]. */
export function kocTiedWith(round: KocRoundState, teamId: string): string[] {
  const mine = kocPointsOf(round, teamId);
  return round.teamIds.filter((id) => id !== teamId && kocPointsOf(round, id) === mine);
}

/** O empate atravessa o corte de classificação — onde a bola de ouro é devida.
 *  Mesma regra de `kocQualifyingTies` no servidor. */
export function kocHasQualifyingTie(round: KocRoundState): boolean {
  const order = kocLiveOrder(round);
  const cut = round.qualifiersPerRound;
  if (cut < 1 || cut >= order.length) return false;
  return kocPointsOf(round, order[cut - 1]) === kocPointsOf(round, order[cut]);
}
