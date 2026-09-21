import type { MatchSide, ServingPlayerSlot } from './serving-player';

/** TEMPO MÉDICO — o atendimento de 5 minutos a um atleta contundido, que PARA a partida.
 *
 *  Diferente do tempo técnico (1 minuto, 2 por set, decisão tática), que as mesas tratam como
 *  estado local de tela: o tempo médico mora no doc da partida porque ele é o único intervalo
 *  que o telão e as outras mesas precisam enxergar ao vivo — quem está sendo atendido, de qual
 *  dupla, e quanto falta — e porque o limite dele é POR ATLETA NA PARTIDA, então a mesa
 *  precisa lembrar quem já usou mesmo se recarregar ou se o mesário trocar de superfície.
 *
 *  A contagem NÃO é um cronômetro gravado: o doc guarda só `startedAt` (carimbo do servidor) e
 *  a duração, e cada tela calcula o que falta. É o que faz o app, a mesa do organizador, a do
 *  atleta e o telão mostrarem o MESMO número sem nenhuma escrita durante os 5 minutos — e por
 *  isso não existe "pausar": pausa exigiria escrever a cada toque e as telas divergiriam.
 *
 *  Espelhado em `match_medical_timeout_logic.dart` (mesa I1 do app). */

/** 5 minutos — atendimento médico das regras de vôlei de praia (CBV/FIVB). */
export const MEDICAL_TIMEOUT_SECONDS = 300;

/** Um tempo médico por ATLETA na partida (não por set, não por dupla). */
export const MEDICAL_TIMEOUTS_PER_PLAYER = 1;

/** O tempo médico em andamento, como o doc grava. Ausente = nenhum atendimento rolando. */
export interface MedicalTimeout {
  side: MatchSide;
  teamId: string;
  /** Posição do atleta na dupla — mesma convenção de `serving-player.ts`. */
  playerSlot: 1 | 2;
  /** Nome congelado no momento do chamado: o telão mostra quem está sendo atendido sem
   *  depender do join de perfis ter chegado. Vazio quando a mesa não tinha o nome. */
  playerName: string;
  startedAt: Date | null;
  durationSec: number;
  setIndex: number;
}

/** Chave de quem já usou o tempo médico — "A1", "B2". Identifica o ATLETA sem precisar do uid,
 *  pela mesma posição na dupla que o saque individual usa. */
export function medicalTimeoutPlayerKey(side: MatchSide, slot: 1 | 2): string {
  return `${side}${slot}`;
}

export function medicalTimeoutPlayerKeysFromRaw(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && /^[AB][12]$/.test(v));
}

export function medicalTimeoutFromRaw(raw: unknown): MedicalTimeout | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const side = o['side'] === 'A' || o['side'] === 'B' ? o['side'] : null;
  const playerSlot = o['playerSlot'] === 1 || o['playerSlot'] === 2 ? o['playerSlot'] : null;
  if (side == null || playerSlot == null) return null;
  const started = o['startedAt'] as { toDate?: () => Date } | undefined;
  const duration = typeof o['durationSec'] === 'number' && o['durationSec'] > 0 ? Math.trunc(o['durationSec']) : MEDICAL_TIMEOUT_SECONDS;
  return {
    side,
    teamId: typeof o['teamId'] === 'string' ? o['teamId'] : '',
    playerSlot,
    playerName: typeof o['playerName'] === 'string' ? o['playerName'] : '',
    startedAt: typeof started?.toDate === 'function' ? started.toDate() : null,
    durationSec: duration,
    setIndex: typeof o['setIndex'] === 'number' ? Math.trunc(o['setIndex']) : 0,
  };
}

/** Quanto falta, em segundos. `startedAt` só chega `null` na janela entre a escrita local e o
 *  carimbo do servidor voltar pelo snapshot — nessa fração a contagem mostra o tempo cheio, e
 *  não zero, que pareceria atendimento encerrado. */
export function medicalTimeoutRemainingSeconds(timeout: Pick<MedicalTimeout, 'startedAt' | 'durationSec'>, now: Date): number {
  if (!timeout.startedAt) return timeout.durationSec;
  const elapsed = Math.floor((now.getTime() - timeout.startedAt.getTime()) / 1000);
  return Math.min(Math.max(timeout.durationSec - elapsed, 0), timeout.durationSec);
}

/** Acabou o tempo, mas o overlay segue aberto até o mesário encerrar — quem decide se o atleta
 *  volta é a mesa, não o relógio. */
export function isMedicalTimeoutEnded(timeout: Pick<MedicalTimeout, 'startedAt' | 'durationSec'>, now: Date): boolean {
  return medicalTimeoutRemainingSeconds(timeout, now) <= 0;
}

export function hasUsedMedicalTimeout(usedKeys: readonly string[], side: MatchSide, slot: 1 | 2): boolean {
  return usedKeys.includes(medicalTimeoutPlayerKey(side, slot));
}

/** Pode chamar atendimento pra este atleta? Um por atleta na partida, e nunca com outro
 *  atendimento em andamento. */
export function canRequestMedicalTimeout(params: { usedKeys: readonly string[]; active: MedicalTimeout | null; side: MatchSide; slot: ServingPlayerSlot }): boolean {
  if (params.active != null) return false;
  if (params.slot !== 1 && params.slot !== 2) return false;
  return !hasUsedMedicalTimeout(params.usedKeys, params.side, params.slot);
}

/** "04:37" — a contagem do overlay. */
export function formatMedicalTimeoutMmSs(totalSec: number): string {
  const safe = Math.min(Math.max(Math.trunc(totalSec), 0), 5999);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
