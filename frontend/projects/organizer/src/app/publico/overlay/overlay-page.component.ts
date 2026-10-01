import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { isKingOfCourtMatchType, kocColumnLabel, normalizeMatchType } from '../../painel/data/koc';
import { resolveCourtNames } from '../../painel/data/matches-repository';
import { finalKindOf } from '../../painel/telao/telao-final-mode';
import { OverlayLiveGateway } from './overlay-live.gateway';
import { OverlayKocBarComponent } from './overlay-koc-bar.component';
import { finalResultOf } from './overlay-final';
import { OverlayFinalComponent, type FinalCampeoes } from './overlay-final.component';
import { kocPreRoundOf } from './overlay-koc-preround';
import { OverlayKocPreRoundComponent } from './overlay-koc-preround.component';
import { kocQualifiedBoardOf } from './overlay-koc-qualified';
import { OverlayKocQualifiedComponent } from './overlay-koc-qualified.component';
import { kocStandingsBoardOf } from './overlay-koc-standings';
import { OverlayKocStandingsComponent } from './overlay-koc-standings.component';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
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

/** Quanto cada tela fica no ar no rodízio do fim de rodada. */
const RESULTADO_MS = 20_000;
const CLASSIFICADAS_MS = 15_000;

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
        [categoria]="categoryName()"
        [quadra]="courtName()"
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

        <og-overlay-doacao [config]="doacaoConfig" [show]="doacaoShow() && !interviewOnAir()" />
        <og-overlay-patro [itens]="patroItens()" [show]="patroShow()" [visivelSeg]="patroConfig.card.visivelSeg" />
        <!-- Sempre montada: o animate.leave da tarja precisa do host vivo. -->
        <og-overlay-interview [data]="interviewNoAr()" />
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

  /** O que vai ao ar: regra automática de cada tela E chave do painel; tarja toma a tela. */
  private readonly layers = computed(() =>
    overlayLayersOf(
      this.controle(),
      {
        duel: this.duelViewAuto() != null,
        kocBar: this.kocViewAuto() != null,
        kocPreRound: this.preRoundAuto() != null,
        roundEnd: this.standings() != null,
        champions: this.campeoesAuto() != null,
      },
      this.interviewOnAir(),
    ),
  );

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

  /** Campeões da categoria. Tem precedência sobre a classificação da rodada: a final KOTC também
   *  é uma rodada encerrada, e as duas telas juntas seriam duas verdades no mesmo espaço. */
  private readonly campeoesAuto = computed<FinalCampeoes | null>(() => {
    const m = this.match();
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
  });
  protected readonly campeoes = computed(() => (this.layers().champions ? this.campeoesAuto() : null));

  /** Classificação da rodada KOTC encerrada. */
  protected readonly standings = computed(() => {
    const m = this.match();
    if (!m || !isKingOfCourtMatchType(m.matchType) || m.status !== 'completed') return null;
    if (this.campeoesAuto()) return null;
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
    return pausado || this.campeoes() != null || fimDeRodada || this.doacaoShow() || this.interviewOnAir();
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
      this.telaKoc.set('resultado');
      // Visualização fixada na URL ou escolhida na mão não reveza.
      if (!chave || this.telaFixa() || this.telaDoPainel()) return;
      let timer: ReturnType<typeof setTimeout>;
      const agenda = (tela: TelaKoc) => {
        timer = setTimeout(
          () => {
            const proxima: TelaKoc = tela === 'resultado' ? 'classificadas' : 'resultado';
            this.telaKoc.set(proxima);
            agenda(proxima);
          },
          tela === 'resultado' ? RESULTADO_MS : CLASSIFICADAS_MS,
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

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
