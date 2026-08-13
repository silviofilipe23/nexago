import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchClosedSets, matchIsLive, type TournamentMatch } from '../../../data/matches-repository';
import type { TournamentPrize } from '../../../data/tournaments-repository';
import { timeLabelOf, liveScoreLineOf } from '../../tournament-format';
import {
  byScheduleTime,
  campaignOf,
  groupLabelOf,
  isPending,
  knockoutLabelOf,
  outcomeOf,
  qualificationOf,
  roundDisplayNumberOf,
  sideOf,
  type CampaignEntry,
  type MatchOutcome,
} from '../../tournament-live.selectors';
import { TournamentLiveStore, type DuoPlayer } from '../../tournament-live.store';
import { guaranteedPrizeOf, tournamentNumbersOf, winsToTitleOf } from '../focus-journey';
import { focusViewContextOf, type FocusViewContext } from '../focus-views';

/**
 * `winsToTitleOf` (Task 5) devolve três respostas — ver a doc dela em `focus-journey.ts` — e cada
 * uma vira um desenho de manchete diferente. Modelar como união discriminada em vez de deixar `0`
 * cair no mesmo ramo textual de `1`/`N` evita reintroduzir o bug que a própria doc avisa: "0
 * vitórias" não é uma contagem regressiva, é o título já na mão.
 */
export type JourneyHeadline = { kind: 'champion' } | { kind: 'countdown'; text: string };

export function journeyHeadlineOf(wins: number | null): JourneyHeadline | null {
  if (wins == null) return null;
  if (wins === 0) return { kind: 'champion' };
  return { kind: 'countdown', text: wins === 1 ? '1 vitória do título.' : `${wins} vitórias do título.` };
}

/**
 * A pior colocação ainda possível a partir de uma campanha que precisa de `wins` vitórias pro
 * título. Em eliminação simples esse número de vitórias restantes já denuncia o tamanho da chave
 * que falta disputar — 1 vitória é a final (chave de 2), 2 vitórias é a semifinal (chave de 4) — e
 * perder a próxima partida encerra a campanha nessa chave, não antes. É a mesma leitura do
 * exemplo que a doc de `guaranteedPrizeOf` já usa: "quem está na final termina no máximo em 2º" é
 * `2 ** 1`.
 */
export function bestPossiblePlaceOf(wins: number): number {
  return 2 ** wins;
}

/** Fases de mata-mata da categoria, da mais distante da final pra final — mesma extração que
 *  `focus-journey.ts` já faz em `knockoutRounds` (privada lá). Duplicada aqui de propósito, não
 *  importada: é a única peça de informação que `bracketWorstPlaceOf` precisaria pedir emprestada
 *  de `winsToTitleOf`, e o ponto inteiro de `bracketWorstPlaceOf` é NÃO depender dela — ver o
 *  porquê no comentário abaixo. */
function knockoutRoundsOf(matches: readonly TournamentMatch[], categoryId: string): number[] {
  const rounds = matches.filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch).map((m) => m.round);
  return [...new Set(rounds)].sort((a, b) => a - b);
}

/**
 * A pior colocação que a posição REAL do atleta na chave ainda permite — vivo, com uma partida
 * de mata-mata pendente numa fase, OU já eliminado nela. `2 ** (rodadas restantes a partir da
 * fase de referência)`, a mesma régua de `bestPossiblePlaceOf`, mas aplicada à fase em que o
 * atleta REALMENTE está, não à contagem de vitórias que faltam pro título.
 *
 * NÃO deriva de `winsToTitleOf`, de propósito. `winsToTitleOf` responde "quantas vitórias faltam
 * pro título" — uma pergunta que deixa de fazer sentido assim que o atleta perde, e por isso ela
 * devolve `null` nesse momento (ver a doc dela em `focus-journey.ts`). Só que "o que a premiação
 * já garante" é uma pergunta DIFERENTE, que continua fazendo sentido depois da eliminação: quem
 * venceu a quartas e perdeu a semifinal, numa chave QF/SF/F, segue garantido em 4º — e este app
 * modela uma disputa de 3º lugar de verdade (`KNOCKOUT_LABELS['third place']`,
 * `category-bracket-builders.ts`) que essa dupla ainda vai jogar por dinheiro real. As duas
 * perguntas só COINCIDEM enquanto o atleta segue vivo (por isso os casos "vivo" batem com
 * `bestPossiblePlaceOf(winsToTitleOf(...))`, ver `focus-journey.component.spec.ts`) — encadear
 * esta função a `winsToTitleOf` faria a premiação já garantida sumir do card bem no momento em
 * que o atleta mais quer ver o que ele já embolsou.
 *
 * `null` só quando o atleta não tem NENHUMA partida de mata-mata na categoria (ainda nos grupos,
 * ou chave/categoria sem mata-mata) — sem posição na chave, não há o que garantir. Mesma condição
 * do gate `inKnockout` do componente; mantida aqui também pra a função ficar íntegra sozinha.
 */
export function bracketWorstPlaceOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): number | null {
  const rounds = knockoutRoundsOf(matches, categoryId);
  const myKnockouts = matches.filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) !== null);
  if (myKnockouts.length === 0) return null;

  // A fase de referência é sempre a de round mais alto entre as partidas do atleta: enquanto ele
  // avança, `winnerAdvance` já grava o time dele na próxima partida (ver a doc de
  // `journeyPathOf`/`possibleOpponentsOf` sobre esse mecanismo), então essa partida mais recente
  // é sempre a pendente atual OU a que ele perdeu — nunca uma vitória de uma fase anterior.
  const reference = myKnockouts.reduce((latest, m) => (m.round > latest.round ? m : latest));
  const index = rounds.indexOf(reference.round);
  const isLastRound = reference.round === rounds[rounds.length - 1];
  const champion = isLastRound && outcomeOf(reference, myTeamIds) === 'win';
  if (champion) return 1;

  return 2 ** (rounds.length - index);
}

export interface JourneyPath {
  mine: readonly TournamentMatch[];
  future: readonly TournamentMatch[];
}

/**
 * Caminho até a final: as partidas do atleta em ordem, seguidas das fases de mata-mata ainda sem
 * dono. Extraída como função pura (parâmetros crus, não `this.store`) pra ser testável sem
 * `TestBed` — ver `focus-journey.component.spec.ts`.
 */
export function journeyPathOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): JourneyPath {
  const mine = matches.filter((m) => m.categoryId === categoryId && sideOf(m, myTeamIds) !== null).sort(byScheduleTime);
  const future = matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) === null && isPending(m))
    .sort((a, b) => a.round - b.round);
  return { mine, future };
}

export interface JourneyFutureRow {
  round: number;
  phaseLabel: string;
  /** Só quando a fase já tem horário real marcado pelo organizador — nunca uma estimativa
   *  calculada a partir da duração média das partidas. */
  timeLabel: string | null;
}

/**
 * Uma linha por fase restante. `future` pode conter várias partidas do MESMO round — grupos
 * paralelos da chave que ainda não têm dono nenhum, dos dois lados — mas a jornada é uma linha do
 * tempo do atleta, não uma lista de partidas de outras duplas: cada fase aparece uma vez só.
 */
export function futurePhasesOf(future: readonly TournamentMatch[]): JourneyFutureRow[] {
  const seenRounds = new Set<number>();
  const rows: JourneyFutureRow[] = [];
  for (const m of future) {
    if (seenRounds.has(m.round)) continue;
    seenRounds.add(m.round);
    rows.push({ round: m.round, phaseLabel: knockoutLabelOf(m), timeLabel: m.scheduleTime ? timeLabelOf(m.scheduleTime) : null });
  }
  return rows;
}

export interface PossibleOpponent {
  teamId: string;
  name: string;
  players: [DuoPlayer, DuoPlayer];
  campaign: CampaignEntry[];
}

/**
 * Duplas que podem cruzar com o atleta: só quando o slot da chave já tem dono — nunca um time
 * vazio ("a definir") — e nunca uma partida de grupo (ninguém "cruza" no mata-mata antes dele
 * existir).
 *
 * Filtra também por `isPending`: sem isso, uma partida de mata-mata JÁ ENCERRADA entre duas
 * duplas que não são o atleta continuaria listando as duas — inclusive a que perdeu e já foi
 * eliminada, que não pode mais cruzar com ninguém. Uma vez que o vencedor avança, ele reaparece
 * no slot preenchido da PRÓXIMA partida (se ainda pendente); a partida antiga, resolvida, sai da
 * lista.
 */
export function possibleOpponentsOf(
  matches: readonly TournamentMatch[],
  categoryId: string,
  myTeamIds: ReadonlySet<string>,
  duoNameOf: (teamId: string) => string,
  duoPlayersOf: (teamId: string) => [DuoPlayer, DuoPlayer],
): PossibleOpponent[] {
  return matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) === null && isPending(m))
    .flatMap((m) => [m.teamAId, m.teamBId])
    .filter((id) => id.length > 0 && !myTeamIds.has(id))
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((teamId) => ({
      teamId,
      name: duoNameOf(teamId),
      players: duoPlayersOf(teamId),
      campaign: campaignOf(matches, teamId, duoNameOf),
    }));
}

function phaseLabelOf(matches: readonly TournamentMatch[], m: TournamentMatch): string {
  return m.poolId ? `${groupLabelOf(m.poolId, matches)} · Rodada ${roundDisplayNumberOf(matches, m.poolId, m.round)}` : knockoutLabelOf(m);
}

/** "21-15 · 21-12" do PONTO DE VISTA DO ATLETA. `matchClosedSets` guarda os sets crus (lado A
 *  primeiro); quando o atleta é o lado B, a leitura direta inverteria o placar — pareceria que
 *  ele perdeu o set que venceu. */
function mySetsLabelOf(m: TournamentMatch, side: 'A' | 'B'): string | null {
  const sets = matchClosedSets(m);
  if (sets.length === 0) return null;
  return sets.map((s) => (side === 'A' ? `${s.a}-${s.b}` : `${s.b}-${s.a}`)).join(' · ');
}

export interface JourneyMatchRow {
  matchId: string;
  phaseLabel: string;
  /** `null` numa partida ainda sem horário marcado — o card não promete estimativa. */
  timeLabel: string | null;
  opponentName: string;
  /** Sets fechados do ponto de vista do atleta, ou o placar ao vivo — `null` antes de começar. */
  scoreLabel: string | null;
  outcome: MatchOutcome;
  live: boolean;
  clickable: boolean;
}

function journeyRowOf(ctx: FocusViewContext, m: TournamentMatch): JourneyMatchRow {
  // `m` vem de `journeyPathOf(...).mine`, que já filtrou por `sideOf(...) !== null` — a asserção
  // só documenta essa garantia, não introduz um caso novo.
  const side = sideOf(m, ctx.myTeamIds)!;
  const opponentId = side === 'A' ? m.teamBId : m.teamAId;
  const opponentDescription = side === 'A' ? m.teamBDescription : m.teamADescription;
  const live = matchIsLive(m);
  return {
    matchId: m.id,
    phaseLabel: phaseLabelOf(ctx.matches, m),
    timeLabel: m.scheduleTime ? timeLabelOf(m.scheduleTime) : null,
    opponentName: ctx.duoNameOf(opponentId, opponentDescription),
    scoreLabel: live ? liveScoreLineOf(m) : mySetsLabelOf(m, side),
    outcome: outcomeOf(m, ctx.myTeamIds),
    live,
    clickable: Boolean(m.teamAId && m.teamBId),
  };
}

export interface JourneyPrizeRow {
  position: number;
  label: string;
  /** `null` quando o prêmio não tem valor em dinheiro cadastrado (ex.: só troféu). */
  valueLabel: string | null;
  guaranteed: boolean;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Seção "Trajetória" do Modo Focus: o caminho do atleta na chave, os números reais da campanha,
 * quem pode cruzar com ele no mata-mata e o que a tabela de premiação já garante.
 *
 * Fora do escopo por decisão de produto (ver o brief da Task 8): projeção de ranking, XP/nível,
 * aproveitamento ou erros (nenhuma estatística ponto a ponto é coletada), "últimos 5" ou scouting
 * dos adversários (exigiria histórico entre torneios que esta seção não carrega), e botão de
 * compartilhar (trabalho futuro deliberado).
 */
@Component({
  selector: 'app-focus-journey',
  imports: [RouterLink],
  templateUrl: './focus-journey.component.html',
  styleUrl: './focus-journey.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusJourneyComponent {
  protected readonly store = inject(TournamentLiveStore);

  /** Fotografia do store consumida pelas funções puras — ver a documentação de `FocusViewContext`
   *  (`focus-views.ts`) sobre por que essa indireção existe: nada aqui depende do relógio, então
   *  fica de fora do `ctx` e nunca precisa entrar nele. */
  private readonly ctx = computed(() => focusViewContextOf(this.store));

  protected readonly winsToTitle = computed(() =>
    winsToTitleOf(this.store.matches(), this.store.focusCategoryId() ?? '', this.store.myTeamIds()),
  );

  protected readonly headline = computed(() => journeyHeadlineOf(this.winsToTitle()));

  protected readonly enrolledLabel = computed(() => {
    const categoryId = this.store.focusCategoryId();
    const count = categoryId ? (this.store.enrolledByCategory().get(categoryId) ?? null) : null;
    if (count == null) return null;
    return count === 1 ? '1 dupla' : `${count} duplas`;
  });

  /** "Classificado" só quando o grupo já encerrou E o atleta avançou — nunca durante o grupo,
   *  pelo mesmo motivo de `qualificationOf`: afirmar classificação antes do fim exigiria simular
   *  o desempate. */
  protected readonly qualified = computed(() => {
    const poolId = this.store.focusPoolId();
    const category = this.store.focusCategory();
    if (!poolId || !category) return false;
    const info = qualificationOf(this.store.matches(), poolId, this.store.myTeamIdInFocus(), this.store.standingsOf(poolId), category.qualifiersPerGroup);
    return info?.decided === true && info.qualifies;
  });

  private readonly path = computed<JourneyPath>(() =>
    journeyPathOf(this.store.matches(), this.store.focusCategoryId() ?? '', this.store.myTeamIds()),
  );

  protected readonly pathRows = computed<JourneyMatchRow[]>(() => {
    const ctx = this.ctx();
    return this.path().mine.map((m) => journeyRowOf(ctx, m));
  });

  protected readonly futureRows = computed(() => futurePhasesOf(this.path().future));

  /** Já tem assento confirmado no mata-mata (não só nos grupos) — ver o gate em `guaranteedPrize`
   *  logo abaixo sobre por que isso importa. */
  private readonly inKnockout = computed(() => this.path().mine.some((m) => !m.poolId && !m.isGroupMatch));

  protected readonly numbers = computed(() => tournamentNumbersOf(this.store.matches(), this.store.myTeamIds()));

  protected readonly maxSetValue = computed(() => this.numbers().sets.reduce((max, s) => Math.max(max, s.mine, s.theirs), 1));

  protected readonly possibleOpponents = computed<PossibleOpponent[]>(() => {
    const categoryId = this.store.focusCategoryId();
    if (!categoryId) return [];
    const ctx = this.ctx();
    return possibleOpponentsOf(ctx.matches, categoryId, ctx.myTeamIds, ctx.duoNameOf, ctx.duoPlayersOf);
  });

  private readonly prizes = computed(() => this.store.tournament()?.tournamentPrizes ?? []);

  /**
   * Gate em `inKnockout`, não em `winsToTitle()`: um atleta ainda nos grupos pode nem se
   * classificar pro mata-mata, então nenhuma colocação está garantida antes de um assento
   * confirmado na chave (mesmo raciocínio de sempre — ver `inKnockout` acima). A colocação em si
   * vem de `bracketWorstPlaceOf`, não de `winsToTitle()`: essa última fica `null` assim que o
   * atleta perde uma partida do mata-mata, e a premiação já garantida NÃO deveria desaparecer
   * nesse momento — ver a doc de `bracketWorstPlaceOf` pro porquê.
   */
  protected readonly guaranteedPrize = computed<TournamentPrize | null>(() => {
    if (!this.inKnockout()) return null;
    const worstPlace = bracketWorstPlaceOf(this.store.matches(), this.store.focusCategoryId() ?? '', this.store.myTeamIds());
    if (worstPlace == null) return null;
    return guaranteedPrizeOf(this.prizes(), worstPlace);
  });

  protected readonly prizeRows = computed<JourneyPrizeRow[]>(() => {
    const guaranteed = this.guaranteedPrize();
    return this.prizes()
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        position: p.position,
        label: p.label ?? `${p.position}º lugar`,
        valueLabel: p.value > 0 ? formatBRL(p.value) : null,
        guaranteed: guaranteed != null && guaranteed.position === p.position,
      }));
  });
}
