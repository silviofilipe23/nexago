import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { isKingOfCourtMatchType, kocColumnLabel, normalizeMatchType } from '../../painel/data/koc';
import { resolveCourtNames, type TournamentMatch } from '../../painel/data/matches-repository';
import { finalKindOf } from '../../painel/telao/telao-final-mode';
import { KOC_CLASSIFICADAS_MS, KOC_RESULTADO_MS } from './overlay-court';
import { OverlayLiveGateway } from './overlay-live.gateway';
import { OverlayKocBarComponent } from './overlay-koc-bar.component';
import { categoryFinalOf, finalResultOf } from './overlay-final';
import { OverlayFinalComponent, type FinalCampeoes } from './overlay-final.component';
import { kocPreRoundOf } from './overlay-koc-preround';
import { OverlayKocPreRoundComponent } from './overlay-koc-preround.component';
import { kocQualifiedBoardOf } from './overlay-koc-qualified';
import { OverlayKocQualifiedComponent } from './overlay-koc-qualified.component';
import { kocStandingsBoardOf } from './overlay-koc-standings';
import { OverlayKocStandingsComponent } from './overlay-koc-standings.component';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
import { OverlayPrejogoComponent } from './overlay-prejogo.component';
import { OverlayRankingComponent } from './overlay-ranking.component';
import { OverlayResumoComponent } from './overlay-resumo.component';
import { RESUMO_AUTO_DELAY_MS, RESUMO_AUTO_MAX_MS, resumoOf, type ResumoView } from './overlay-resumo';
import { OverlayMedicoComponent } from './overlay-medico.component';
import { medicoOf, type OverlayMedicoView } from './overlay-medico';
import { OverlayTecnicoComponent } from './overlay-tecnico.component';
import { TECNICO_AUTO_SEGUNDOS, tecnicoAutoKeyOf, tecnicoInfoOf, tecnicoManualOf, tecnicoNoAr, type OverlayTecnicoView } from './overlay-tecnico';
import { DEFAULT_BROADCAST_CONTROL, finalPrefOf, type BroadcastControl } from '../../painel/data/broadcast-control';
import {
  interviewVisibleAt,
  nextCommandStep,
  nextInterviewAir,
  overlayFinalModeOf,
  overlayLayersOf,
  panelRoundEndScreen,
  type CommandMemory,
  type InterviewAir,
} from './overlay-broadcast';
import { OverlayInterviewComponent } from './overlay-interview.component';
import { kocRoundTitleOf } from './overlay-koc-bar';
import { overlayViewOf } from './overlay-selectors';
import { OverlayDoacaoComponent } from './overlay-doacao.component';
import { OverlayPatroComponent } from './overlay-patro.component';
import {
  patroCycleShowNow,
  patroCycleStart,
  patroCycleStop,
  patroCycleTick,
  type PatroCycleState,
} from './overlay-patro-cycle';
import {
  doacaoCycleShowNow,
  doacaoCycleStart,
  doacaoCycleStop,
  doacaoCycleTick,
  type DoacaoCycleState,
} from './overlay-doacao-cycle';
import {
  DEFAULT_OVERLAY_DOACAO,
  DEFAULT_OVERLAY_PATRO,
  type OverlayDoacaoConfig,
  type OverlayPatroConfig,
  type OverlayPatroItem,
} from './overlay-nx';

type TelaKoc = 'resultado' | 'classificadas';

const TELAS_KOC: readonly string[] = ['resultado', 'classificadas'];

/** Visualização fixada em `?tela=`. Valor desconhecido volta ao rodízio, em vez de deixar a tela
 *  vazia — ninguém vai depurar query param no meio de uma transmissão. */
function telaFixadaEm(raw: string | null): TelaKoc | null {
  const v = (raw ?? '').trim().toLowerCase();
  return TELAS_KOC.includes(v) ? (v as TelaKoc) : null;
}

/** Rota PÚBLICA `/overlay/:matchId` — o Browser Source do OBS, que não tem sessão.
 *
 *  Lê só coleções com `read: if true` (matches, teams, public_profiles, tournaments), as
 *  mesmas da página de acompanhamento `/t/:tournamentId`. Nenhuma regra nova de Firestore. */
@Component({
  selector: 'og-overlay-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OverlayScoreboardComponent,
    OverlayKocBarComponent,
    OverlayKocStandingsComponent,
    OverlayKocQualifiedComponent,
    OverlayKocPreRoundComponent,
    OverlayFinalComponent,
    OverlayDoacaoComponent,
    OverlayPatroComponent,
    OverlayInterviewComponent,
    OverlayTecnicoComponent,
    OverlayMedicoComponent,
    OverlayResumoComponent,
    OverlayPrejogoComponent,
    OverlayRankingComponent,
  ],
  providers: [OverlayLiveGateway],
  host: {
    '[class.preview]': 'previewChrome()',
  },
  template: `
    @if (campeoes(); as c) {
      <!-- Fora do .fit: o componente já tem canvas próprio 1920×1080. -->
      <og-overlay-final
        [resultado]="c"
        [torneio]="gateway.tournament()?.name ?? ''"
        [categoria]="podioCategoryName()"
        [quadra]="podioCourtName()"
      />
    }
    <div class="stage">
      <div class="fit">
        @if (duelView(); as duel) {
          <og-overlay-scoreboard
            [view]="duel"
            [teams]="gateway.teams()"
            [categoryName]="categoryName()"
            [courtName]="courtName()"
            [isFinal]="duelFinalMode()"
            [tecnicoSide]="tecnico()?.side ?? null"
            [encolhido]="medico() != null"
            [class.fora]="resumo() != null || tecnico() != null || prejogo() != null"
          />
        }
        @if (telaDoResultado(); as board) {
          <og-overlay-koc-standings
            [board]="board"
            [teams]="gateway.teams()"
            [categoryName]="categoryName()"
            [courtName]="courtName()"
            [phaseName]="phaseName()"
            [roundLabel]="roundLabel()"
          />
        }
        @if (telaDasClassificadas(); as board) {
          <og-overlay-koc-qualified
            [board]="board"
            [teams]="gateway.teams()"
            [tournamentName]="gateway.tournament()?.name ?? null"
            [phaseName]="phaseName()"
            [categoryName]="categoryName()"
          />
        }
        <!-- Sempre montado: o @if interno + animate.leave precisa do host vivo pra sair com o slide. -->
        <og-overlay-koc-preround
          [preRound]="preRound()"
          [teams]="gateway.teams()"
          [categoryName]="categoryName()"
          [courtName]="courtName()"
          [roundTitle]="preRoundTitle()"
        />
        @if (kocView(); as koc) {
          <og-overlay-koc-bar
            [view]="koc"
            [teams]="gateway.teams()"
            [categoryName]="categoryName()"
            [categoryGender]="categoryGender()"
            [courtName]="courtName()"
            [position]="kocPosition()"
            [isFinal]="kocBarFinal()"
          />
        }

        <!-- Sempre montada: o animate.leave do card precisa do host vivo. -->
        <og-overlay-tecnico [view]="tecnico()" [teams]="gateway.teams()" [sponsors]="patroItens()" />

        <og-overlay-prejogo [card]="prejogo()" [sponsors]="patroItens()" />
        <og-overlay-ranking [card]="ranking()" [mode]="rankingMode()" [sponsors]="patroItens()" />
        <og-overlay-resumo [view]="resumo()" [teams]="gateway.teams()" [sponsors]="patroItens()" />
        <og-overlay-medico [view]="medico()" [teams]="gateway.teams()" />

        <og-overlay-doacao [config]="doacaoConfig" [show]="cardsNoAr() && doacaoShow()" />
        <og-overlay-patro [itens]="patroItens()" [show]="cardsNoAr() && patroShow()" [visivelSeg]="patroConfig.card.visivelSeg" />
        <!-- Sempre montada: o animate.leave da tarja precisa do host vivo. -->
        <og-overlay-interview [data]="interviewNoAr()" [eventName]="gateway.tournament()?.name ?? ''" [sponsors]="patroItens()" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      overflow: hidden;
    }
    /* Resumo ou tempo técnico no ar: o placar (e a marca) saem com fade e 30 px pra baixo. */
    og-overlay-scoreboard {
      transition:
        opacity 0.6s ease,
        transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    }
    og-overlay-scoreboard.fora {
      opacity: 0;
      transform: translateY(30px);
    }
    :host.preview {
      background:
        radial-gradient(1200px 700px at 20% 80%, rgba(255, 106, 26, 0.12), transparent 60%),
        radial-gradient(900px 600px at 80% 20%, rgba(80, 90, 140, 0.28), transparent 55%),
        #1a1b22;
    }

    .stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: transparent;
    }
    .fit {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 1920px;
      height: 1080px;
      transform-origin: 0 0;
      overflow: hidden;
      background: transparent;
    }
  `,
})
export class OverlayPageComponent {
  /** Params da rota chegam por `withComponentInputBinding` — `input()`, nunca `signal()`. */
  readonly matchId = input('');
  /** Modo quadra: `/overlay/:tournamentId/quadra/:courtId`. */
  readonly tournamentId = input('');
  readonly courtId = input('');
  /** `?tela=resultado|classificadas` — fixa a visualização e desliga o rodízio. */
  readonly tela = input<string | null>(null);
  readonly pos = input<string | null>(null);
  /** `?clean` — força fundo transparente (OBS). Sem isto e sem `?preview`, também transparente. */
  readonly clean = input<string | null>(null);
  /** `?preview` — fundo de teste pra depurar no browser (ignorado se `?clean` estiver na URL). */
  readonly preview = input<string | null>(null);
  /** Rota `/transmissao/:tournamentId` (`data: { transmissao: true }`): segue a quadra
   *  escolhida no painel em vez de uma quadra fixa na URL. */
  readonly transmissao = input(false);

  protected readonly gateway = inject(OverlayLiveGateway);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Fundo de preview só com `?preview` e sem `?clean` — o default fica transparente pro OBS. */
  protected readonly previewChrome = computed(
    () => this.preview() != null && this.clean() == null,
  );

  private readonly telaKoc = signal<TelaKoc>('resultado');
  private readonly telaFixa = computed(() => telaFixadaEm(this.tela()));

  /** Controle do painel; antes do 1º snapshot, o default (= comportamento de antes). */
  private readonly controle = computed<BroadcastControl>(() => this.gateway.control() ?? DEFAULT_BROADCAST_CONTROL);
  /** String, não o controle inteiro: o rodízio só reavalia quando a ESCOLHA muda, não a cada
   *  chave do painel. */
  private readonly escolhaDoPainel = computed(() => this.controle().kocRoundEndScreen);
  private readonly telaDoPainel = computed<TelaKoc | null>(() => panelRoundEndScreen(this.escolhaDoPainel()));
  /** Painel > `?tela=` > rodízio. Nada se escolhe NA tela do ar — ela só exibe. */
  private readonly telaEfetiva = computed<TelaKoc>(
    () => this.telaDoPainel() ?? this.telaFixa() ?? this.telaKoc(),
  );

  /** Torneio do controle: o da rota (quadra/transmissão) ou o da partida (modo partida). */
  private readonly torneioDoControle = computed(
    () => (this.tournamentId() || this.gateway.match()?.tournamentId || '').trim(),
  );
  /** Quadra efetiva. String: o effect que assina a quadra só re-roda quando ela MUDA. */
  private readonly quadraEfetiva = computed(
    () => this.courtId() || (this.transmissao() ? (this.controle().courtId ?? '') : ''),
  );

  private readonly doacaoNoPainel = computed(() => this.controle().graphics.donation);
  private readonly patroNoPainel = computed(() => this.controle().graphics.sponsors);

  /** Tarja recebida; a duração conta do recebimento (ver `nextInterviewAir`). */
  private readonly interviewAir = signal<InterviewAir | null>(null);
  /** Carimbos do último snapshot; `null` = linha de base ainda não registrada. */
  private commandMemory: CommandMemory | null = null;
  protected readonly interviewOnAir = computed(() => {
    const air = this.interviewAir();
    if (!air) return false;
    // Só tarja temporizada lê o relógio — "até tirar" não recalcula a cada segundo.
    return air.data.durationSec == null || interviewVisibleAt(air, this.tick());
  });
  protected readonly interviewNoAr = computed(() =>
    this.interviewOnAir() ? (this.interviewAir()?.data ?? null) : null,
  );

  /** Doação e patrocínio só entram com o controle já resolvido e sem tarja — a tarja toma a
   *  tela, inclusive para um "Mostrar agora". */
  protected readonly cardsNoAr = computed(
    () => this.gateway.controlReady() && !this.interviewOnAir() && this.resumo() == null && this.tecnico() == null && this.prejogo() == null && this.ranking() == null,
  );

  /** O que vai ao ar: regra automática de cada tela E chave do painel; tarja toma a tela.
   *  Antes do controle responder, nada controlável entra (ver `controlReady`). */
  private readonly layers = computed(() => {
    if (!this.gateway.controlReady()) {
      return { duel: false, kocBar: false, kocPreRound: false, roundEnd: false, champions: false, interview: false };
    }
    return overlayLayersOf(
      this.controle(),
      {
        duel: this.duelViewAuto() != null,
        kocBar: this.kocViewAuto() != null,
        kocPreRound: this.preRoundAuto() != null,
        roundEnd: this.standings() != null,
        champions: this.campeoesAuto() != null,
      },
      this.interviewOnAir(),
    );
  });

  /** Muda só quando a partida (ou o fato de estar encerrada) muda. */
  private readonly chaveDoRodizio = computed(() => {
    const m = this.gateway.match();
    return m && isKingOfCourtMatchType(m.matchType) && m.status === 'completed' ? m.id : '';
  });

  /** Relógio de 1 s, lido SÓ pela rodada KOTC — ver `view`. */
  private readonly tick = signal(Date.now());

  /** Jogo agendado pelo auto-agendamento antigo só gravou `courtId`; o nome da quadra sai das
   *  quadras do torneio. */
  private readonly match = computed(() => {
    const m = this.gateway.match();
    if (!m) return null;
    return resolveCourtNames([m], this.gateway.tournament()?.courts ?? [])[0] ?? m;
  });

  /** Final (duelo ou KOTC) já encerrada nesta tela — o placar some; o que fica é o pódio. */
  private readonly finalEncerrada = computed(() => {
    const m = this.match();
    if (!m || m.status !== 'completed') return false;
    if (normalizeMatchType(m.matchType) === 'koc final') return true;
    return finalKindOf(m.matchType) === 'final';
  });

  /** O estreitamento fica no TS; cada formato tem seu componente, não um ramo do outro. */
  private readonly duelViewAuto = computed(() => {
    const v = this.view();
    return v?.kind === 'duel' && !this.finalEncerrada() ? v : null;
  });
  private readonly kocViewAuto = computed(() => {
    const v = this.view();
    // A rodada encerrada dá lugar à classificação — as duas na tela seriam duas verdades
    // disputando o mesmo espaço. Final encerrada também: só o pódio.
    return v?.kind === 'koc' && !this.standings() && !this.finalEncerrada() ? v : null;
  });
  protected readonly duelView = computed(() => (this.layers().duel ? this.duelViewAuto() : null));
  protected readonly kocView = computed(() => (this.layers().kocBar ? this.kocViewAuto() : null));

  /** Elenco da rodada que ainda não começou — antes do apito não há rei nem desafiante, e sem
   *  isto a tela ficava vazia. */
  private readonly preRoundAuto = computed(() => {
    if (this.finalEncerrada()) return null;
    const m = this.match();
    return m ? kocPreRoundOf(m) : null;
  });
  protected readonly preRound = computed(() => (this.layers().kocPreRound ? this.preRoundAuto() : null));

  protected readonly preRoundTitle = computed(() => {
    const m = this.match();
    if (!m) return '';
    return kocRoundTitleOf(
      m.matchType,
      m.koc?.roundLabel ?? 0,
      m.matchNumber,
      this.gateway.totalRounds(),
      {
        poolId: m.koc?.poolId,
        batteryLabel: m.koc?.batteryLabel,
        bracketsInPhase: m.koc?.bracketsInPhase,
      },
    );
  });

  /** Categoria do pódio escolhida no painel; '' = automático. String: o effect que assina as
   *  partidas do torneio só re-roda quando a ESCOLHA muda. */
  private readonly categoriaDoPodio = computed(() => this.controle().championsCategoryId ?? '');

  /** Final decidida da categoria escolhida, em qualquer quadra, com o nome da quadra resolvido. */
  private readonly finalEscolhida = computed(() => {
    const cat = this.categoriaDoPodio();
    if (!cat) return null;
    const m = categoryFinalOf(this.gateway.tournamentMatches(), cat);
    return m ? (resolveCourtNames([m], this.gateway.tournament()?.courts ?? [])[0] ?? m) : null;
  });

  /** Partida de onde sai o pódio: a final da categoria escolhida ou, no automático, a da tela. */
  private readonly partidaDoPodio = computed(() => (this.categoriaDoPodio() ? this.finalEscolhida() : this.match()));

  private campeoesDe(m: TournamentMatch | null): FinalCampeoes | null {
    const r = m ? finalResultOf(m) : null;
    if (!r) return null;
    const face = (teamId: string) => {
      const t = this.gateway.teams().get(teamId);
      return {
        players: (t?.players ?? ['', '']) as [string, string],
        fotos: (t?.photos ?? [null, null]) as [string | null, string | null],
      };
    };
    const campeao = face(r.campeaoTeamId);
    const vice = face(r.viceTeamId);
    return {
      campeao: campeao.players,
      vice: vice.players,
      fotos: campeao.fotos,
      placar: r.placar,
    };
  }

  /** Campeões da partida da TELA — a final KOTC também é uma rodada encerrada, e a classificação
   *  dela não pode disputar o espaço com o pódio. */
  private readonly campeoesDaQuadra = computed(() => this.campeoesDe(this.match()));

  /** Campeões que vão ao ar: os da categoria escolhida no painel ou, no automático, os da tela. */
  private readonly campeoesAuto = computed<FinalCampeoes | null>(() =>
    this.categoriaDoPodio() ? this.campeoesDe(this.finalEscolhida()) : this.campeoesDaQuadra(),
  );

  protected readonly podioCategoryName = computed(() => {
    const m = this.partidaDoPodio();
    return this.gateway.tournament()?.categories.find((c) => c.id === m?.categoryId)?.name ?? null;
  });
  protected readonly podioCourtName = computed(() => this.partidaDoPodio()?.court ?? null);
  protected readonly campeoes = computed(() =>
    this.layers().champions && this.resumo() == null ? this.campeoesAuto() : null,
  );

  /** Classificação da rodada KOTC encerrada. */
  protected readonly standings = computed(() => {
    const m = this.match();
    if (!m || !isKingOfCourtMatchType(m.matchType) || m.status !== 'completed') return null;
    if (this.campeoesDaQuadra()) return null;
    return kocStandingsBoardOf(m, this.gateway.categoryMatches());
  });

  /** Quadro das classificadas da fase — só existe junto com a classificação da rodada. */
  private readonly qualified = computed(() => {
    const m = this.match();
    if (!m || !this.standings()) return null;
    return kocQualifiedBoardOf(m, this.gateway.categoryMatches());
  });

  protected readonly telaDoResultado = computed(() =>
    this.layers().roundEnd && this.telaEfetiva() === 'resultado' ? this.standings() : null,
  );
  protected readonly telaDasClassificadas = computed(() =>
    this.layers().roundEnd && this.telaEfetiva() === 'classificadas' ? this.qualified() : null,
  );

  /** Config fixa da doação (chave PIX nexaGO, tempos padrão). Nada se ajusta NA tela do ar: o que
   *  liga, desliga e mostra agora vem do painel (`broadcast/control`). */
  protected readonly doacaoConfig: OverlayDoacaoConfig = DEFAULT_OVERLAY_DOACAO;
  private readonly doacaoCycle = signal<DoacaoCycleState>(doacaoCycleStop());
  protected readonly doacaoShow = computed(() => this.doacaoCycle().show);
  private doacaoTimer: ReturnType<typeof setTimeout> | null = null;

  private doacaoInput() {
    const cfg = this.doacaoConfig;
    return {
      // `untracked`: este método roda dentro de effects; ler o controle rastreado faria cada
      // clique no painel reiniciar o ciclo. A chave tem effect próprio (construtor).
      enabled: cfg.enabled && untracked(() => this.doacaoNoPainel()),
      hasPix: cfg.pixKey.trim().length > 0,
      atrasoSeg: cfg.atrasoSeg,
      visivelSeg: cfg.visivelSeg,
      intervaloSeg: cfg.intervaloSeg,
    };
  }

  private clearDoacaoTimer(): void {
    if (this.doacaoTimer != null) {
      clearTimeout(this.doacaoTimer);
      this.doacaoTimer = null;
    }
  }

  /** Grava o estado e agenda a próxima transição do ciclo. */
  private runDoacao(state: DoacaoCycleState): void {
    this.clearDoacaoTimer();
    this.doacaoCycle.set(state);
    if (state.waitMs == null) return;
    this.doacaoTimer = setTimeout(() => {
      this.runDoacao(doacaoCycleTick(this.doacaoCycle(), this.doacaoInput()));
    }, state.waitMs);
  }

  protected mostrarDoacao(): void {
    this.runDoacao(doacaoCycleShowNow(this.doacaoInput()));
  }

  /** Tempos fixos do card de patrocinadores; ligar/desligar e "mostrar agora" vêm do painel. */
  protected readonly patroConfig: OverlayPatroConfig = DEFAULT_OVERLAY_PATRO;

  /** Os patrocinadores cadastrados no torneio. */
  protected readonly patroItens = computed<OverlayPatroItem[]>(() =>
    (this.gateway.tournament()?.sponsors ?? []).map((s) => ({ nome: s.name, logo: s.logoUrl })),
  );

  /** Momentos em que o card NÃO entra: pausa (relógio KOTC parado, tempo médico), telas de
   *  resultado/pódio no ar, e a doação no canto — um card de cada vez. */
  private readonly patroOcupado = computed(() => {
    const m = this.match();
    const pausado = m?.status === 'in_progress' && (m.koc?.clock?.pausedAtMs != null || m.medicalTimeout != null);
    const fimDeRodada = this.layers().roundEnd && this.standings() != null;
    return pausado || this.campeoes() != null || fimDeRodada || this.doacaoShow() || this.interviewOnAir() || this.tecnico() != null;
  });

  private readonly patroCycle = signal<PatroCycleState>(patroCycleStop());
  protected readonly patroShow = computed(() => this.patroCycle().show);
  private patroTimer: ReturnType<typeof setTimeout> | null = null;

  private patroInput() {
    const card = this.patroConfig.card;
    return {
      enabled: card.enabled && untracked(() => this.patroNoPainel()),
      count: this.patroItens().length,
      intervaloSeg: card.intervaloSeg,
      visivelSeg: card.visivelSeg,
      ocupado: this.patroOcupado(),
    };
  }

  private runPatro(state: PatroCycleState): void {
    if (this.patroTimer != null) clearTimeout(this.patroTimer);
    this.patroTimer = null;
    this.patroCycle.set(state);
    if (state.waitMs == null) return;
    this.patroTimer = setTimeout(() => {
      this.runPatro(patroCycleTick(this.patroCycle(), this.patroInput()));
    }, state.waitMs);
  }

  protected mostrarPatro(): void {
    this.runPatro(patroCycleShowNow(this.patroInput()));
  }

  protected readonly phaseName = computed(() => {
    const m = this.match();
    return m ? kocColumnLabel(m.matchType) : null;
  });

  protected readonly roundLabel = computed(() => this.match()?.koc?.roundLabel ?? 0);

  protected readonly categoryName = computed(() => {
    const m = this.match();
    const tournament = this.gateway.tournament();
    return tournament?.categories.find((c) => c.id === m?.categoryId)?.name ?? null;
  });

  protected readonly categoryGender = computed(() => {
    const m = this.match();
    const tournament = this.gateway.tournament();
    return tournament?.categories.find((c) => c.id === m?.categoryId)?.gender ?? null;
  });

  protected readonly courtName = computed(() => this.match()?.court ?? null);

  /** A faixa do KOTC ocupa a largura toda: só aceita subir ou descer. */
  protected readonly kocPosition = computed<'top' | 'bottom'>(() =>
    this.pos() === 'top' ? 'top' : 'bottom',
  );

  /** Grande final do painel (`null` = seguir o matchType). */
  private readonly finalPref = computed(() => finalPrefOf(this.controle().finalMode));

  private readonly matchIsKocFinal = computed(
    () => normalizeMatchType(this.match()?.matchType ?? '') === 'koc final',
  );

  /** Barra em visual Grande final — partida final e/ou preferência compartilhada. */
  protected readonly kocBarFinal = computed(() =>
    overlayFinalModeOf(this.matchIsKocFinal(), this.finalPref()),
  );

  /** Mesmo modo no placar de duelo (selo + borda de luz). */
  protected readonly duelFinalMode = computed(() => {
    const m = this.match();
    const isFinal = m ? finalKindOf(m.matchType) === 'final' : false;
    return overlayFinalModeOf(isFinal, this.finalPref());
  });

  /** Tempo técnico automático (vôlei, 21 pontos no set): quando o overlay VÊ a soma chegar a 21.
   *  O início é o relógio desta tela — o doc não guarda nada — e a 1ª leitura é só linha de base:
   *  recarregar o OBS com o set já em 21 não reabre um minuto que ninguém chamou. */
  private readonly tecnicoAuto = signal<{ key: string; startMs: number } | null>(null);
  private tecnicoBaseline = false;
  private readonly tecnicoAutoKey = computed(() => tecnicoAutoKeyOf(this.match(), this.duelViewAuto()));

  /** Tempo técnico no ar: o chamado pela mesa tem prioridade sobre o automático. */
  protected readonly tecnico = computed<OverlayTecnicoView | null>(() => {
    if (!this.layers().duel || this.resumo() != null) return null;
    const v = this.duelViewAuto();
    const nowMs = this.tick();
    const manual = tecnicoManualOf(this.match(), v, nowMs, this.categoryName());
    if (manual) return manual;
    const auto = this.tecnicoAuto();
    if (!auto || !v || auto.key !== this.tecnicoAutoKey()) return null;
    const durMs = TECNICO_AUTO_SEGUNDOS * 1000;
    if (!tecnicoNoAr(auto.startMs, durMs, nowMs)) return null;
    return { kind: 'auto', key: auto.key, startMs: auto.startMs, durMs, side: null, teamId: '', info: tecnicoInfoOf(v, this.categoryName()) };
  });

  /** Pré-jogo no ar: o painel monta o card e liga a chave. A tarja de entrevista toma a tela. */
  protected readonly prejogo = computed(() => {
    const p = this.controle().prejogo;
    return this.gateway.controlReady() && p.on && !this.interviewOnAir() ? p.card : null;
  });

  protected readonly rankingMode = computed(() => this.controle().ranking.mode);

  /** Ranking Top 10 no ar: tela cheia opaca que cobre o resto. A tarja de entrevista toma a tela. */
  protected readonly ranking = computed(() => {
    const r = this.controle().ranking;
    return this.gateway.controlReady() && r.on && !this.interviewOnAir() ? r.card : null;
  });

  /** Resumo aberto sozinho no fim do jogo: id da partida (some quando o jogo muda, é desfeito ou
   *  passam `RESUMO_AUTO_MAX_MS`). O manual vem do painel (`summaryOn`). */
  private readonly resumoAuto = signal<string | null>(null);
  private resumoMemo: { id: string; completed: boolean } | null = null;
  private resumoTimers: ReturnType<typeof setTimeout>[] = [];

  private limparResumoTimers(): void {
    this.resumoTimers.forEach(clearTimeout);
    this.resumoTimers = [];
  }

  /** Só duelo tem Resumo; a partida precisa já ter pontos. */
  private readonly resumoEventsId = computed(() => {
    const v = this.view();
    const m = this.match();
    return v?.kind === 'duel' && m && m.status !== 'scheduled' ? m.id : '';
  });

  protected readonly resumo = computed<ResumoView | null>(() => {
    const m = this.match();
    const v = this.view();
    if (!m || v?.kind !== 'duel' || !this.gateway.controlReady() || this.interviewOnAir()) return null;
    if (!this.controle().summaryOn && this.resumoAuto() !== m.id) return null;
    return resumoOf(m, v, this.gateway.pointEvents(), {
      categoryName: this.categoryName(),
      courtName: this.courtName(),
    });
  });

  /** Atendimento médico no ar — sem patrocinadores, e o placar encolhe (o jogo está parado). */
  protected readonly medico = computed<OverlayMedicoView | null>(() =>
    this.layers().duel && this.resumo() == null ? medicoOf(this.match(), this.duelViewAuto(), this.tick()) : null,
  );

  private readonly view = computed(() => {
    const m = this.match();
    if (!m) return null;
    // Só a rodada KOTC tem relógio. Ler o tique num duelo faria a tela recalcular a cada
    // segundo sem nada mudar.
    const nowMs = isKingOfCourtMatchType(m.matchType) ? this.tick() : 0;
    return overlayViewOf(m, nowMs, this.gateway.totalRounds());
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Canvas lógico 1920×1080: no OBS a fonte já é Full HD (escala 1); no browser
    // encolhe pra caber na janela sem cortar o placar.
    afterNextRender(() => {
      const root = this.host.nativeElement;
      const fit = root.querySelector('.fit') as HTMLElement | null;
      if (!fit) return;
      const aplicar = () => {
        const s = Math.min(root.clientWidth / 1920, root.clientHeight / 1080);
        fit.style.transform = `scale(${s}) translate(-50%, -50%)`;
      };
      aplicar();
      const obs = new ResizeObserver(aplicar);
      obs.observe(root);
      destroyRef.onDestroy(() => obs.disconnect());
    });

    // Rodízio entre as duas telas do fim de rodada. A dependência é uma CHAVE ESTÁVEL (o id da
    // partida encerrada), não um computed que muda a cada snapshot — senão o timer reinicia pra
    // sempre e nenhuma tela chega a trocar.
    effect((onCleanup) => {
      const chave = this.chaveDoRodizio();
      // Seguindo a quadra, o ciclo roda UMA vez: depois das classificadas a quadra passa pra
      // próxima rodada ("Próximos em quadra" — ver `KOC_FIM_DE_RODADA_MS`), e voltar ao resultado
      // piscaria a tabela antes da troca. Na partida fixa da URL não há próxima, então reveza.
      const umaVez = this.quadraEfetiva() !== '';
      this.telaKoc.set('resultado');
      // Visualização fixada na URL ou escolhida na mão não reveza.
      if (!chave || this.telaFixa() || this.telaDoPainel()) return;
      let timer: ReturnType<typeof setTimeout>;
      const agenda = (tela: TelaKoc) => {
        if (umaVez && tela === 'classificadas') return;
        timer = setTimeout(
          () => {
            const proxima: TelaKoc = tela === 'resultado' ? 'classificadas' : 'resultado';
            this.telaKoc.set(proxima);
            agenda(proxima);
          },
          tela === 'resultado' ? KOC_RESULTADO_MS : KOC_CLASSIFICADAS_MS,
        );
      };
      agenda('resultado');
      onCleanup(() => clearTimeout(timer));
    });

    effect((onCleanup) => {
      const quadra = this.quadraEfetiva();
      const torneio = this.tournamentId();
      if (quadra && torneio) {
        onCleanup(this.gateway.startCourt(torneio, quadra));
        return;
      }
      if (this.transmissao() && torneio) {
        onCleanup(this.gateway.startTournament(torneio));
        return;
      }
      const id = this.matchId();
      if (!id) return;
      onCleanup(this.gateway.start(id));
    });

    effect((onCleanup) => {
      const torneio = this.torneioDoControle();
      if (!torneio) return;
      onCleanup(this.gateway.watchControl(torneio));
    });

    // Pódio de categoria escolhida: assina as partidas do torneio só enquanto houver escolha, e
    // resolve nome/foto de campeão e vice, que podem não estar em nenhuma partida da tela.
    effect((onCleanup) => {
      const cat = this.categoriaDoPodio();
      const torneio = this.torneioDoControle();
      if (!cat || !torneio) return;
      onCleanup(this.gateway.watchTournamentMatches(torneio));
    });
    effect(() => {
      const m = this.finalEscolhida();
      const r = m ? finalResultOf(m) : null;
      if (r) untracked(() => this.gateway.ensureTeams([r.campeaoTeamId, r.viceTeamId]));
    });

    // Comandos do painel: o 1º snapshot é a LINHA DE BASE (recarregar o OBS não repete um
    // "mostrar agora" antigo nem reabre tarja temporizada); daí pra frente, carimbo novo = ação.
    effect(() => {
      const c = this.gateway.control();
      if (!c) return;
      untracked(() => {
        const isBaseline = this.commandMemory === null;
        const step = nextCommandStep(this.commandMemory, c);
        this.commandMemory = step.memory;
        this.interviewAir.set(nextInterviewAir(this.interviewAir(), c.interview, isBaseline, Date.now()));
        if (step.donationNow) this.mostrarDoacao();
        if (step.sponsorsNow) this.mostrarPatro();
      });
    });

    // Chaves de doação/patrocínio: desligar para o ciclo; religar recomeça do início.
    effect(() => {
      const ligada = this.doacaoNoPainel();
      untracked(() => this.runDoacao(ligada ? doacaoCycleStart(this.doacaoInput()) : doacaoCycleStop()));
    });
    effect(() => {
      const ligado = this.patroNoPainel();
      untracked(() => this.runPatro(ligado ? patroCycleStart(this.patroInput()) : patroCycleStop()));
    });

    // Os ciclos (doação 3 s → 20 s no ar → 90 s fora; patrocinadores a cada intervalo) começam
    // pelos effects das chaves acima; aqui só os timers morrem com a tela.
    destroyRef.onDestroy(() => {
      this.clearDoacaoTimer();
      if (this.patroTimer != null) clearTimeout(this.patroTimer);
    });
    // A lista chega depois do overlay abrir (snapshot do torneio): quando passa a ter (ou deixa
    // de ter) patrocinador, o ciclo (re)começa — mas nunca derruba um card que está no ar.
    const temPatro = computed(() => this.patroItens().length > 0);
    effect(() => {
      temPatro();
      untracked(() => {
        if (this.patroCycle().phase === 'visible' && temPatro()) return;
        this.runPatro(patroCycleStart(this.patroInput()));
      });
    });

    // Log de pontos do Resumo: só enquanto há duelo com jogo começado.
    effect((onCleanup) => {
      const id = this.resumoEventsId();
      if (!id) return;
      onCleanup(this.gateway.watchPointEvents(id));
    });
    // Resumo automático: a TRANSIÇÃO ao vivo → encerrada (não o estado) abre, 4,5 s depois do
    // ponto final. Recarregar o OBS numa partida já encerrada não reabre o resumo.
    effect(() => {
      const m = this.match();
      untracked(() => {
        const completed = m?.status === 'completed';
        const prev = this.resumoMemo;
        this.resumoMemo = m ? { id: m.id, completed } : null;
        if (!m || prev?.id !== m.id || !completed) {
          this.limparResumoTimers();
          if (this.resumoAuto() != null && (!m || this.resumoAuto() !== m.id || !completed)) this.resumoAuto.set(null);
          return;
        }
        if (prev.completed || this.resumoAuto() === m.id || this.resumoTimers.length > 0) return;
        const id = m.id;
        this.resumoTimers.push(
          setTimeout(() => {
            this.resumoAuto.set(id);
            this.resumoTimers.push(setTimeout(() => this.resumoAuto.set(null), RESUMO_AUTO_MAX_MS));
          }, RESUMO_AUTO_DELAY_MS),
        );
      });
    });
    destroyRef.onDestroy(() => this.limparResumoTimers());

    // Automático: a chave só existe com o set em 21; chave nova = relógio novo (a 1ª é a base).
    effect(() => {
      const key = this.tecnicoAutoKey();
      untracked(() => {
        if (!key) {
          if (this.tecnicoAuto() != null) this.tecnicoAuto.set(null);
          return;
        }
        if (this.tecnicoAuto()?.key === key) return;
        const baseline = !this.tecnicoBaseline;
        this.tecnicoAuto.set({ key, startMs: baseline ? 0 : Date.now() });
      });
    });
    effect(() => {
      if (this.match()) untracked(() => (this.tecnicoBaseline = true));
    });

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
