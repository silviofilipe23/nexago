import { isKingOfCourtMatchType, normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { courtNowOf } from '../../painel/telao/telao-selectors';
import { FINISHED_SHOWCASE_MS, finishedAtOf, type MatchFinishMemory } from '../../painel/telao/telao-finished';
import { finalResultOf } from './overlay-final';
import { kocPreRoundOf } from './overlay-koc-preround';

/** Fim de rodada KOTC no overlay do OBS: resultado da rodada, depois as classificadas da fase. */
export const KOC_RESULTADO_MS = 20_000;
export const KOC_CLASSIFICADAS_MS = 15_000;
/** O ciclo inteiro do fim de rodada. No modo quadra é quanto a rodada encerrada segura a quadra
 *  antes de dar lugar à próxima — a janela de 30 s do telão cortava as classificadas no meio. */
export const KOC_FIM_DE_RODADA_MS = KOC_RESULTADO_MS + KOC_CLASSIFICADAS_MS;

export interface OverlayCourtContext {
  match: TournamentMatch | null;
  categoryMatches: TournamentMatch[];
  totalRounds: number;
}

/** Final já encerrada nesta quadra — campeões ficam no ar pra sempre.
 *
 *  Diferente da celebração comum (30 s): o pódio é o clímax do torneio e a Browser Source
 *  do OBS costuma ficar aberta horas. Se a janela de fim expirasse, a tela ia pro "livre"
 *  ou pra próxima partida e o pódio sumia no ar.
 *
 *  "Pra sempre" vale só enquanto a quadra continua sendo só daquela categoria. Evento com
 *  várias categorias no mesmo dia reaproveita a quadra (viu isso ao vivo: KOTC não grava
 *  `scheduledAt`, só `courtId` — então nem dá pra confiar em "tem próxima agendada" pra saber
 *  que a quadra virou a página). Qualquer partida de OUTRA categoria já associada a esta quadra
 *  — ao vivo, encerrada ou só marcada — prova que ela não é mais exclusiva da categoria que fez
 *  a final, e o pódio antigo para de mandar. Partida da MESMA categoria (ex.: disputa de 3º
 *  remarcada depois da decisão) não conta: é o cenário que esta regra existe pra proteger. */
function finalEncerradaNaQuadra(
  matches: readonly TournamentMatch[],
  courtId: string,
): TournamentMatch | null {
  let escolhida: TournamentMatch | null = null;
  let maisRecente = -1;
  for (const m of matches) {
    if (m.courtId !== courtId) continue;
    if (!finalResultOf(m)) continue;
    const at = m.matchEndedAt?.getTime() ?? 0;
    if (at >= maisRecente) {
      maisRecente = at;
      escolhida = m;
    }
  }
  if (!escolhida) return null;

  const outraCategoriaNaQuadra = matches.some(
    (m) => m.courtId === courtId && m.categoryId !== escolhida!.categoryId,
  );
  return outraCategoriaNaQuadra ? null : escolhida;
}

/** Rodada KOTC encerrada nesta quadra que ainda está dentro do fim de rodada (`segurarMs`, contado
 *  de quando a tela viu o fim). Só importa depois dos 30 s do `courtNowOf`. */
function rodadaKocNoFimDeRodada(
  matches: readonly TournamentMatch[],
  courtId: string,
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
  segurarMs: number,
): TournamentMatch | null {
  let escolhida: TournamentMatch | null = null;
  let maisRecente = -1;
  for (const m of matches) {
    if (m.courtId !== courtId || m.status !== 'completed' || !isKingOfCourtMatchType(m.matchType)) continue;
    const at = finishedAtOf(finishMemory, m.id);
    if (at == null || nowMs - at >= segurarMs) continue;
    if (at > maisRecente) {
      maisRecente = at;
      escolhida = m;
    }
  }
  return escolhida;
}

/** Como cada tela que segue a quadra trata o KOTC entre uma rodada e outra. */
export interface CourtFollowOptions {
  /** Quanto a rodada KOTC encerrada segura a quadra, contado de quando a tela viu o fim. */
  segurarRodadaKocMs: number;
  /** Sem rodada com elenco NESTA quadra, anunciar a próxima da categoria em outra quadra. */
  proximaEmOutraQuadra: boolean;
}

/** Painel de LED: é o painel DA quadra física — anunciar dupla de outra quadra mandaria atleta pro
 *  lugar errado — e as duas telas de fim dele cabem nos 30 s do telão. */
export const LED_COURT_FOLLOW: CourtFollowOptions = {
  segurarRodadaKocMs: FINISHED_SHOWCASE_MS,
  proximaEmOutraQuadra: false,
};

/** Overlay do OBS: segura o ciclo resultado + classificadas inteiro e acompanha a CATEGORIA. O
 *  gerador distribui as rodadas de uma chave entre as quadras pelo horário (a rodada 6 numa, a 7
 *  na outra), então seguir a quadra à risca deixava a transmissão vazia justo quando o elenco da
 *  rodada seguinte já é conhecido. O card mostra a quadra no topo. */
export const OVERLAY_COURT_FOLLOW: CourtFollowOptions = {
  segurarRodadaKocMs: KOC_FIM_DE_RODADA_MS,
  proximaEmOutraQuadra: true,
};

/** Rodada da categoria com elenco pronto, na ordem da agenda (sem horário vai pro fim) e, no
 *  empate, do nº do jogo. */
function primeiraComElenco(candidatas: readonly TournamentMatch[]): TournamentMatch | null {
  return (
    candidatas
      .filter((m) => kocPreRoundOf(m) != null)
      .sort(
        (a, b) =>
          (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity) ||
          a.matchNumber - b.matchNumber,
      )[0] ?? null
  );
}

/** Próxima rodada da categoria KOTC que acabou de jogar nesta quadra — nesta quadra primeiro e,
 *  se `emOutraQuadra`, nas outras.
 *
 *  Existe porque o `courtNowOf` só acha "próxima" NESTA quadra e com `scheduledAt` de no máximo
 *  30 min atrás: com a quadra atrasada, rodada sem horário ou a rodada seguinte da chave em outra
 *  quadra, a tela ficava vazia até o apito em vez de anunciar quem entra. A âncora é a ÚLTIMA
 *  partida encerrada na quadra: se ela não foi KOTC, a quadra já virou a página e isto não se
 *  aplica. */
function proximaRodadaKoc(
  matches: readonly TournamentMatch[],
  courtId: string,
  emOutraQuadra: boolean,
): TournamentMatch | null {
  const ultima = matches
    .filter((m) => m.courtId === courtId && m.status === 'completed')
    .sort((a, b) => (b.matchEndedAt?.getTime() ?? 0) - (a.matchEndedAt?.getTime() ?? 0))[0];
  if (!ultima || !isKingOfCourtMatchType(ultima.matchType)) return null;
  const daCategoria = matches.filter((m) => m.categoryId === ultima.categoryId);
  const aqui = primeiraComElenco(daCategoria.filter((m) => m.courtId === courtId));
  if (aqui || !emOutraQuadra) return aqui;
  return primeiraComElenco(daCategoria.filter((m) => m.courtId !== courtId));
}

/** Ao vivo → recém-encerrada → (rodada KOTC no fim de rodada) → próxima.
 *
 *  Na "próxima", a rodada seguinte da categoria KOTC em andamento vence a agendada do
 *  `courtNowOf` quando as duas são da mesma categoria (a agendada pode ser uma rodada lá na
 *  frente, sem elenco, porque as do meio ficaram fora da tolerância de horário ou noutra quadra).
 *  De categorias diferentes, rodada de OUTRA quadra não fura a fila desta; nesta quadra, manda a
 *  agenda: quem está marcada antes entra antes. */
function partidaDaQuadra(
  matches: readonly TournamentMatch[],
  courtId: string,
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
  opts: CourtFollowOptions,
): TournamentMatch | null {
  const agora = courtNowOf(matches, courtId, nowMs, finishMemory);
  if (agora.kind === 'live' || agora.kind === 'finished') return agora.match;

  const fimDeRodada = rodadaKocNoFimDeRodada(matches, courtId, nowMs, finishMemory, opts.segurarRodadaKocMs);
  if (fimDeRodada) return fimDeRodada;

  const agendada = agora.match;
  const seguinte = proximaRodadaKoc(matches, courtId, opts.proximaEmOutraQuadra);
  if (!seguinte || !agendada) return seguinte ?? agendada;
  if (agendada.categoryId === seguinte.categoryId) return seguinte;
  if (seguinte.courtId !== courtId) return agendada;
  return agendada.scheduledAt!.getTime() < (seguinte.scheduledAt?.getTime() ?? Infinity) ? agendada : seguinte;
}

/** Qual partida o overlay por QUADRA mostra agora, e o contexto de fase que as telas precisam.
 *
 *  A base da escolha é o `courtNowOf` do telão (ao vivo → recém-encerrada → próxima), já testado;
 *  o KOTC acrescenta o fim de rodada inteiro e a rodada seguinte com elenco (`partidaDaQuadra`),
 *  na medida de cada tela (`CourtFollowOptions`). Sem partida, nada de contexto — categoria e
 *  total de uma partida que não está no ar só teriam como enganar a tela.
 *
 *  Exceção: final encerrada nesta quadra manda sempre — ver guarda de categoria em
 *  `finalEncerradaNaQuadra`. */
export function overlayCourtContextOf(
  matches: readonly TournamentMatch[],
  courtId: string,
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
  opts: CourtFollowOptions = LED_COURT_FOLLOW,
): OverlayCourtContext {
  const final = finalEncerradaNaQuadra(matches, courtId);
  const escolhida = final ?? partidaDaQuadra(matches, courtId, nowMs, finishMemory, opts);
  if (!escolhida) return { match: null, categoryMatches: [], totalRounds: 0 };

  const categoryMatches = matches.filter((m) => m.categoryId === escolhida.categoryId);
  const fase = normalizeMatchType(escolhida.matchType);
  return {
    match: escolhida,
    categoryMatches,
    totalRounds: categoryMatches.filter((m) => normalizeMatchType(m.matchType) === fase).length,
  };
}
