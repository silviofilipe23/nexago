import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchClosedSets, matchIsLive, type TournamentMatch } from '../../../data/matches-repository';
import type { TournamentPrize } from '../../../data/tournaments-repository';
import { isDoubleElimination } from '../../bracket-tree';
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
import { guaranteedPrizeOf, knockoutRounds, pendingKnockoutsOf, tournamentNumbersOf, winsToTitleOf } from '../focus-journey';
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
 * perguntas só COINCIDEM enquanto o atleta segue vivo — encadear esta função a `winsToTitleOf`
 * faria a premiação já garantida sumir do card bem no momento em que o atleta mais quer ver o
 * que ele já embolsou.
 *
 * A fase de referência NÃO é "a de round mais alto que o atleta aparece" — essa foi a primeira
 * versão desta função, e se mostrou insegura: a disputa de 3º lugar recebe o MESMO round da
 * final (`category-bracket-builders.ts` — "3º lugar: perdedores das semifinais", `round:
 * roundStart + totalRounds - 1`, igual ao da final) e `loserAdvance` cria essa partida pendente
 * no INSTANTE em que a semifinal termina (`category-bracket-advance.ts`). Um atleta que perdeu a
 * semifinal já tem, na mesma leitura, uma partida de 3º lugar pendente NO ROUND DA FINAL —
 * "pegar o round mais alto" devolvia 2 ali, dizendo a um eliminado na semifinal que ele estava
 * garantido vice-campeão. A regra certa escolhe a referência pelo SIGNIFICADO, não pelo round:
 *
 * - Dupla eliminação: `null`. A ladder não é uma sequência única — WB e LB numeram rounds
 *   independentemente a partir de 1 (`category-bracket-builders.ts`) — então qualquer contagem
 *   sobre o round misturando as duas não tem sentido. Mesma guarda de `winsToTitleOf`, mesmo
 *   motivo; usa o mesmo `isDoubleElimination` em vez de reinventar a detecção.
 * - Se o atleta já PERDEU alguma partida do mata-mata: a referência é a derrota MAIS CEDO (menor
 *   round). Em eliminação simples uma derrota encerra a campanha, então é a derrota mais cedo que
 *   fixa a colocação — isso ignora sozinho uma disputa de 3º lugar ainda pendente (não é uma
 *   derrota) e também cobre quem perdeu a própria disputa de 3º lugar (a derrota mais cedo
 *   continua sendo a da semifinal, então a pior colocação continua 4º, o valor certo).
 * - Senão: a referência é a partida de mata-mata PENDENTE mais cedo (menor round), calculada por
 *   `pendingKnockoutsOf` (`focus-journey.ts`) — nunca a de round mais alto, nunca anterior à
 *   última partida já VENCIDA, e nunca um bye já consumido. Achado N1 do round 3 de review,
 *   confirmado por execução contra `buildSingleEliminationMatches`: um BYE é gravado como partida
 *   real (`A=mine, B=—`, `status: Scheduled`) e NUNCA é jogado — sem um piso, "a pendente mais
 *   cedo" ancorava nesse bye pra sempre, e um atleta que recebeu bye na 1ª rodada (todo mata-mata
 *   que não é potência de 2 tem algum — 6 duplas → 2 byes, 12 → 4) lia a chave inteira como
 *   pendência ("8º"/"16º") não importa quantas fases reais já tivesse vencido depois. O piso por
 *   si só (`wonRoundsFloorOf`) não bastou: até o atleta vencer a PRIMEIRA partida real, o piso é
 *   `-Infinity` e o bye — propagado pra rodada seguinte NA CONSTRUÇÃO da chave, antes de qualquer
 *   partida ser jogada — continua sendo "a pendente mais cedo". `pendingKnockoutsOf` fecha essa
 *   janela reconhecendo o bye pelo que ele é: uma partida pendente de slot vazio em que o atleta
 *   já aparece numa rodada posterior (achado do round 5; ver a doc de `isConsumedByeOf`,
 *   `focus-journey.ts`, pro porquê o slot vazio sozinho não basta). Compartilhada com
 *   `winsToTitleOf` — achados do round 4 (o mesmo bug do piso existia lá, visível na manchete "N
 *   vitórias do título") e do round 5 (o mesmo bug do bye "ainda não vencido nada" também) — pra
 *   não duplicar a regra de novo.
 *
 * Conservadorismo deliberado: quem VENCE a disputa de 3º lugar está de fato garantido em 3º, mas
 * esta função continua devolvendo 4º, porque a referência permanece a derrota da semifinal. Não
 * adicione um caso especial pra espremer esse último degrau — sub-informar uma garantia é seguro;
 * super-informar é exatamente o bug que esta função existe pra evitar (ver o histórico acima).
 *
 * A detecção de campeão (nenhuma derrota, nenhuma pendência a partir do piso) é por `matchType
 * === 'final'`, não por `round === lastRound` — achado N2 do round 3: a mesma colisão de round da
 * disputa de 3º lugar (acima) também alcançava o campeão, só que blindada apenas pela ORDEM dos
 * `if`s (derrota checada antes), sem nenhuma blindagem própria. Latente, não alcançável hoje (não
 * há caminho de escrita que produza um mata-mata completed sem `winnerId`), mas key-ar por tipo
 * em vez de por round elimina essa dependência de ordem por completo.
 *
 * `null` também quando o atleta não tem NENHUMA partida de mata-mata na categoria — sem posição
 * na chave, não há o que garantir. Mesma condição do gate `inKnockout` do componente; mantida
 * aqui também pra a função ficar íntegra sozinha.
 */
export function bracketWorstPlaceOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): number | null {
  const categoryMatches = matches.filter((m) => m.categoryId === categoryId);
  if (isDoubleElimination(categoryMatches)) return null;

  const rounds = knockoutRounds(matches, categoryId);
  const myKnockouts = categoryMatches.filter((m) => !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) !== null);
  if (myKnockouts.length === 0) return null;

  const losses = myKnockouts.filter((m) => outcomeOf(m, myTeamIds) === 'loss');
  if (losses.length > 0) {
    const earliestLoss = losses.reduce((earliest, m) => (m.round < earliest.round ? m : earliest));
    return 2 ** (rounds.length - rounds.indexOf(earliestLoss.round));
  }

  // Piso + byes já consumidos (achados N1/round 3, round 4 e round 5 de review — ver
  // `pendingKnockoutsOf` em `focus-journey.ts`, compartilhada com `winsToTitleOf` em vez de
  // duplicada aqui: a cópia foi exatamente o que deixou a segunda desatualizada até o round 4).
  const pending = pendingKnockoutsOf(myKnockouts, myTeamIds);
  if (pending.length > 0) {
    const earliestPending = pending.reduce((earliest, m) => (m.round < earliest.round ? m : earliest));
    return 2 ** (rounds.length - rounds.indexOf(earliestPending.round));
  }

  // Sem derrota nenhuma e sem pendência nenhuma (a partir do piso): só resta o campeão, que
  // venceu a FINAL — checado pelo `matchType` (achado N2 do round 3: nunca por `round`, o mesmo
  // erro de fundo que a disputa de 3º lugar já expôs para `losses`/`pending` acima — ver a doc da
  // função). O gerador grava a final como `matchType: 'Final'` exatamente
  // (`category-bracket-builders.ts`); comparação case-insensitive no valor trim() pelo mesmo
  // motivo de `knockoutLabelOf` (`tournament-live.selectors.ts`).
  const champion = myKnockouts.some((m) => m.matchType.trim().toLowerCase() === 'final' && outcomeOf(m, myTeamIds) === 'win');
  return champion ? 1 : null;
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
 *
 * `knockoutRoundsOfCategory` vem à parte porque `future` já é um RECORTE (só as fases ainda sem
 * dono) — não dá pra recalcular a partir dele a lista completa de rounds da categoria que
 * `knockoutLabelOf` precisa pra saber a distância até a final.
 */
export function futurePhasesOf(future: readonly TournamentMatch[], knockoutRoundsOfCategory: readonly number[]): JourneyFutureRow[] {
  const seenRounds = new Set<number>();
  const rows: JourneyFutureRow[] = [];
  for (const m of future) {
    if (seenRounds.has(m.round)) continue;
    seenRounds.add(m.round);
    rows.push({ round: m.round, phaseLabel: knockoutLabelOf(m, knockoutRoundsOfCategory), timeLabel: m.scheduleTime ? timeLabelOf(m.scheduleTime) : null });
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
      campaign: campaignOf(matches, teamId, duoNameOf, knockoutRounds(matches, categoryId)),
    }));
}

function phaseLabelOf(matches: readonly TournamentMatch[], m: TournamentMatch): string {
  return m.poolId
    ? `${groupLabelOf(m.poolId, matches)} · Rodada ${roundDisplayNumberOf(matches, m.poolId, m.round)}`
    : knockoutLabelOf(m, knockoutRounds(matches, m.categoryId));
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
    const categoryId = this.store.focusCategoryId();
    if (!poolId || !category || !categoryId) return false;
    // Partidas da categoria, não do torneio: `qualificationOf` conta as pendentes do grupo por
    // `poolId`, e 'Grupo A' existe em toda categoria (ver `buildGroupStandings`).
    const info = qualificationOf(
      this.store.matchesOfCategory(categoryId),
      poolId,
      this.store.myTeamIdInFocus(),
      this.store.standingsOf(categoryId, poolId),
      category.qualifiersPerGroup,
    );
    return info?.decided === true && info.qualifies;
  });

  private readonly path = computed<JourneyPath>(() =>
    journeyPathOf(this.store.matches(), this.store.focusCategoryId() ?? '', this.store.myTeamIds()),
  );

  protected readonly pathRows = computed<JourneyMatchRow[]>(() => {
    const ctx = this.ctx();
    return this.path().mine.map((m) => journeyRowOf(ctx, m));
  });

  protected readonly futureRows = computed(() =>
    futurePhasesOf(this.path().future, knockoutRounds(this.store.matches(), this.store.focusCategoryId() ?? '')),
  );

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
