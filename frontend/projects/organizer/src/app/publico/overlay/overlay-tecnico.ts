import { TECHNICAL_TIMEOUT_SECONDS } from '@nexago/live-scoring';
import { effectiveScoringProfile, isAutoTechnicalTimeoutDue } from '@nexago/sports';
import { matchLiveCurrentSet } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OverlayDuelView } from './overlay-selectors';

/** Tempo técnico no ar: o card entra quando a mesa grava o minuto no doc e sai quando passa o
 *  minuto, quando qualquer ponto é marcado ou `TECNICO_SAIDA_MS` depois do relógio zerar.
 *
 *  O automático do 21º ponto (opção `autoTechnicalTimeout` do torneio) o overlay também enxerga
 *  sozinho, pela MESMA regra das mesas: assim ele entra no ponto, mesmo que a mesa seja uma versão
 *  sem a opção ou a gravação dela atrase. Quando o doc chega, o card do doc assume (mesma chave,
 *  sem reanimar) e, se a mesa encerrar antes do minuto, o overlay não reabre o dele.
 *
 *  Puro pelo mesmo motivo dos ciclos de doação/patrocínio: a tela só agenda e desenha, e a regra
 *  de "quando está no ar" mora aqui, com teste. */

export const TECNICO_SAIDA_MS = 4000;

export interface OverlayTecnicoView {
  /** Muda a cada tempo técnico novo — chave do `@for` que re-anima a entrada. */
  key: string;
  startMs: number;
  durMs: number;
  /** Lado que pediu; `null` no automático (vale pras duas). */
  side: 'A' | 'B' | null;
  auto: boolean;
  teamId: string;
  /** Linha de informação: "Set 2 · 17 × 19 · Masculino B". */
  info: string;
}

/** Ainda cabe na tela? Some `TECNICO_SAIDA_MS` depois de zerar. */
export function tecnicoNoAr(startMs: number, durMs: number, nowMs: number): boolean {
  return nowMs < startMs + durMs + TECNICO_SAIDA_MS;
}

/** Segundos restantes, arredondados pra cima: 60 s mostra "1:00", não "0:59". */
export function tecnicoRestanteSeg(startMs: number, durMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((durMs - (nowMs - startMs)) / 1000));
}

export function tecnicoClock(totalSec: number): string {
  const s = Math.max(0, Math.trunc(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Linha de informação: vôlei mostra os pontos do set, games mostra games e ponto do game. */
export function tecnicoInfoOf(v: OverlayDuelView, categoryName: string | null): string {
  const games = v.gameA != null && v.gameB != null;
  const placar = games
    ? `Games ${v.pointsA ?? 0} × ${v.pointsB ?? 0} · ${v.gameA} × ${v.gameB}`
    : `${v.pointsA ?? 0} × ${v.pointsB ?? 0}`;
  return [`Set ${v.currentSetNumber}`, placar, categoryName?.trim() ?? '']
    .filter((p) => p !== '')
    .join(' · ');
}

/** Tempo técnico gravado pela mesa (chamado por uma dupla ou automático) e ainda válido: o placar do set é o do instante da chamada
 *  (ponto marcado = acabou). `null` fora disso. */
export function tecnicoManualOf(
  match: TournamentMatch | null,
  v: OverlayDuelView | null,
  nowMs: number,
  categoryName: string | null,
): OverlayTecnicoView | null {
  const tt = match?.technicalTimeout;
  if (!match || !tt || !v || !tecnicoDocNoPlacar(match)) return null;
  // Sem carimbo ainda (escrita local antes do servidor responder): minuto cheio a partir de agora.
  const startMs = tt.startedAt?.getTime() ?? nowMs;
  const durMs = tt.durationSec * 1000;
  if (!tecnicoNoAr(startMs, durMs, nowMs)) return null;
  return {
    // Automático com a mesma chave do que o overlay enxerga sozinho: o card não reanima na troca.
    key: tt.auto ? tecnicoAutoKey(match.id, tt.setIndex + 1) : `${match.id}:${tt.setIndex}:${startMs}`,
    startMs,
    durMs,
    side: tt.side,
    auto: tt.auto,
    teamId: tt.side == null ? '' : tt.teamId || (tt.side === 'A' ? match.teamAId : match.teamBId),
    info: tecnicoInfoOf(v, categoryName),
  };
}

/** O tempo técnico do doc ainda vale pro placar atual (ponto marcado depois da chamada = acabou;
 *  campo esquecido de um tempo antigo não conta). */
export function tecnicoDocNoPlacar(match: TournamentMatch): boolean {
  const tt = match.technicalTimeout;
  if (!tt || match.status !== 'in_progress') return false;
  const live = matchLiveCurrentSet(match);
  return live != null && live.setNumber - 1 === tt.setIndex && live.a === tt.scoreA && live.b === tt.scoreB;
}

function tecnicoAutoKey(matchId: string, setNumber: number): string {
  return `${matchId}:${setNumber}:auto`;
}

/** Chave do automático do 21º ponto na partida, ou `null` fora dele: opção do torneio ligada,
 *  partida ao vivo e a soma do set em 21 num set de 21 (`isAutoTechnicalTimeoutDue`, a regra das
 *  mesas). O decisivo de 15 fica de fora. */
export function tecnicoAutoKeyOf(match: TournamentMatch | null, enabled: boolean): string | null {
  if (!enabled || !match) return null;
  const live = matchLiveCurrentSet(match);
  if (!live) return null;
  const profile = effectiveScoringProfile(match.scoringProfile, match.bestOf);
  if (!isAutoTechnicalTimeoutDue(profile, live.setNumber - 1, { a: live.a, b: live.b })) return null;
  return tecnicoAutoKey(match.id, live.setNumber);
}

/** O minuto que o overlay abriu sozinho: a chave do 21 e o instante em que ESTA tela o viu.
 *  `startMs: 0` = já vencido (nunca entra no ar). */
export interface TecnicoAutoState {
  key: string;
  startMs: number;
}

/** Próximo estado do automático a cada leitura (partida + torneio carregados):
 *  - sem chave (ponto marcado, set novo, opção desligada): some;
 *  - a 1ª leitura é só linha de base — recarregar o OBS com o set já em 21 não reabre o minuto;
 *  - com tempo técnico no doc (o da mesa, automático ou de dupla), a mesa manda: o do overlay
 *    vence na hora e não volta quando a mesa encerrar;
 *  - chave nova = relógio novo; a mesma chave mantém o relógio. */
export function tecnicoAutoNext(
  prev: TecnicoAutoState | null,
  input: { key: string | null; baseline: boolean; docActive: boolean; nowMs: number },
): TecnicoAutoState | null {
  const { key } = input;
  if (!key) return null;
  if (input.baseline || input.docActive) return prev?.key === key && prev.startMs === 0 ? prev : { key, startMs: 0 };
  if (prev?.key === key) return prev;
  return { key, startMs: input.nowMs };
}

/** Card do automático visto pelo overlay, enquanto couber na tela. */
export function tecnicoAutoViewOf(
  state: TecnicoAutoState | null,
  key: string | null,
  v: OverlayDuelView | null,
  nowMs: number,
  categoryName: string | null,
): OverlayTecnicoView | null {
  if (!state || !v || state.key !== key) return null;
  const durMs = TECHNICAL_TIMEOUT_SECONDS * 1000;
  if (!tecnicoNoAr(state.startMs, durMs, nowMs)) return null;
  return { key: state.key, startMs: state.startMs, durMs, side: null, auto: true, teamId: '', info: tecnicoInfoOf(v, categoryName) };
}
