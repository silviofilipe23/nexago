import type { BroadcastControl, BroadcastInterview, KocRoundEndScreen } from '../../painel/data/broadcast-control';

/** O que a página do overlay já decide sozinha (as regras de antes do painel). */
export interface OverlayAutoLayers {
  duel: boolean;
  kocBar: boolean;
  kocPreRound: boolean;
  roundEnd: boolean;
  champions: boolean;
}

export interface OverlayLayers extends OverlayAutoLayers {
  interview: boolean;
}

/** O que vai ao ar: a regra automática de cada tela E a chave do painel. Tarja no ar toma a
 *  tela — placar e faixa KOTC ficam no rodapé, exatamente onde ela entra, e o card de campeões
 *  cobriria a câmera da entrevista. Quando a tarja sai, cada tela volta pela própria regra. */
export function overlayLayersOf(
  control: BroadcastControl,
  auto: OverlayAutoLayers,
  interviewOnAir: boolean,
): OverlayLayers {
  if (interviewOnAir) {
    return { duel: false, kocBar: false, kocPreRound: false, roundEnd: false, champions: false, interview: true };
  }
  const g = control.graphics;
  return {
    duel: auto.duel && g.scoreboard,
    kocBar: auto.kocBar && g.kocBar,
    kocPreRound: auto.kocPreRound && g.kocPreRound,
    roundEnd: auto.roundEnd && g.kocRoundEnd,
    champions: auto.champions && g.champions,
    interview: false,
  };
}

export interface CommandMemory {
  donationNowAt: number;
  sponsorsNowAt: number;
}

export interface CommandStep {
  memory: CommandMemory;
  donationNow: boolean;
  sponsorsNow: boolean;
}

/** "Mostrar agora" é carimbo: dispara quando o valor MUDA em relação ao snapshot anterior. O 1º
 *  snapshot (`prev === null`) é só linha de base — recarregar o OBS não repete um comando velho. */
export function nextCommandStep(prev: CommandMemory | null, control: BroadcastControl): CommandStep {
  const memory = { ...control.commands };
  if (!prev) return { memory, donationNow: false, sponsorsNow: false };
  return {
    memory,
    donationNow: memory.donationNowAt > 0 && memory.donationNowAt !== prev.donationNowAt,
    sponsorsNow: memory.sponsorsNowAt > 0 && memory.sponsorsNowAt !== prev.sponsorsNowAt,
  };
}

/** Tarja que o overlay recebeu e quando. A duração conta do RECEBIMENTO, nunca do `shownAt`:
 *  painel e OBS podem estar em máquinas com relógios diferentes. */
export interface InterviewAir {
  data: BroadcastInterview;
  receivedAtMs: number;
}

/** Tarja temporizada já presente no 1º snapshot (OBS recarregado no meio dela) vira registro
 *  JÁ EXPIRADO, em vez de `null`: guardar o `shownAt` é o que impede o snapshot seguinte — de
 *  qualquer outra chave — de tratá-la como comando novo e reexibi-la. */
export function nextInterviewAir(
  prev: InterviewAir | null,
  interview: BroadcastInterview | null,
  isBaseline: boolean,
  nowMs: number,
): InterviewAir | null {
  if (!interview) return null;
  if (prev && prev.data.shownAt === interview.shownAt) return prev;
  if (isBaseline && interview.durationSec != null) {
    return { data: interview, receivedAtMs: Number.NEGATIVE_INFINITY };
  }
  return { data: interview, receivedAtMs: nowMs };
}

export function interviewVisibleAt(air: InterviewAir | null, nowMs: number): boolean {
  if (!air) return false;
  const d = air.data.durationSec;
  return d == null || nowMs - air.receivedAtMs < d * 1000;
}

/** Escolha do painel para o fim de rodada KOTC; `null` = rodízio (o overlay decide). */
export function panelRoundEndScreen(screen: KocRoundEndScreen): 'resultado' | 'classificadas' | null {
  return screen === 'rodizio' ? null : screen;
}

/** Visual Grande final efetivo: preferência do painel manda; sem ela, segue o matchType. */
export function overlayFinalModeOf(matchIsFinal: boolean, pref: boolean | null): boolean {
  return pref ?? matchIsFinal;
}
