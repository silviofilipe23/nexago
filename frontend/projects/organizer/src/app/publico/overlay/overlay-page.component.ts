import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { isKingOfCourtMatchType, kocColumnLabel, normalizeMatchType } from '../../painel/data/koc';
import { resolveCourtNames } from '../../painel/data/matches-repository';
import { finalKindOf } from '../../painel/telao/telao-final-mode';
import { OverlayLiveGateway } from './overlay-live.gateway';
import { OverlayKocBarComponent } from './overlay-koc-bar.component';
import { finalResultOf } from './overlay-final';
import { OverlayFinalComponent, type FinalCampeoes } from './overlay-final.component';
import {
  OVERLAY_FINAL_CHANNEL,
  overlayFinalModeOf,
  readOverlayFinalPref,
  type OverlayFinalMsg,
} from './overlay-final-sync';
import { kocPreRoundOf } from './overlay-koc-preround';
import { OverlayKocPreRoundComponent } from './overlay-koc-preround.component';
import { kocQualifiedBoardOf } from './overlay-koc-qualified';
import { OverlayKocQualifiedComponent } from './overlay-koc-qualified.component';
import { kocStandingsBoardOf } from './overlay-koc-standings';
import { OverlayKocStandingsComponent } from './overlay-koc-standings.component';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
import { kocRoundTitleOf } from './overlay-koc-bar';
import { overlayCornerOf, overlayViewOf } from './overlay-selectors';
import { OverlayDoacaoComponent } from './overlay-doacao.component';
import {
  doacaoCycleShowNow,
  doacaoCycleStart,
  doacaoCycleStop,
  doacaoCycleTick,
  type DoacaoCycleState,
} from './overlay-doacao-cycle';
import {
  bindOverlayDoacaoControls,
  getOverlaySettings,
  installNxOverlay,
  subscribeOverlaySettings,
  type OverlayDoacaoConfig,
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
  ],
  providers: [OverlayLiveGateway],
  host: { '(document:keydown)': 'aoTeclar($event)' },
  template: `
    @if (campeoes(); as c) {
      <og-overlay-final
        [resultado]="c"
        [torneio]="gateway.tournament()?.name ?? ''"
        [categoria]="categoryName()"
        [quadra]="courtName()"
      />
    }
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
    @if (podeAlternar()) {
      <!-- Invisível e por cima: no OBS o clique chega pela janela "Interagir" e o cursor não
           entra na saída, então nada disto aparece no ar. -->
      <button
        class="alternar"
        type="button"
        aria-label="Alternar visualização"
        (click)="alternar()"
      ></button>
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

    <og-overlay-doacao [config]="doacaoConfig()" [show]="doacaoShow()" />

    <!-- Atalhos invisíveis pro modo Interagir do OBS (canto superior direito). -->
    <div class="doacao-hot">
      <button type="button" class="doacao-hot-btn" aria-label="Mostrar doação" (click)="mostrarDoacao()"></button>
      <button type="button" class="doacao-hot-btn" aria-label="Desligar doação" (click)="desligarDoacao()"></button>
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

    .alternar {
      position: fixed;
      inset: 0;
      z-index: 10;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
    }

    .doacao-hot {
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 30;
      display: flex;
      gap: 4px;
    }
    .doacao-hot-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
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

  protected readonly gateway = inject(OverlayLiveGateway);

  private readonly telaKoc = signal<TelaKoc>('resultado');
  /** Visualização escolhida no clique/tecla. Assume o controle: quem mexeu manda mais que o
   *  rodízio e mais que `?tela=`. */
  private readonly manual = signal<TelaKoc | null>(null);
  private readonly telaFixa = computed(() => telaFixadaEm(this.tela()));
  private readonly telaEfetiva = computed<TelaKoc>(
    () => this.manual() ?? this.telaFixa() ?? this.telaKoc(),
  );

  /** Muda só quando a partida (ou o fato de estar encerrada) muda. */
  private readonly chaveDoRodizio = computed(() => {
    const m = this.gateway.match();
    return m && isKingOfCourtMatchType(m.matchType) && m.status === 'completed' ? m.id : '';
  });

  /** Relógio de 1 s, lido SÓ pela rodada KOTC — ver `view`. */
  private readonly tick = signal(Date.now());

  protected readonly corner = computed(() => overlayCornerOf(this.pos()));

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
  protected readonly duelView = computed(() => {
    const v = this.view();
    return v?.kind === 'duel' && !this.finalEncerrada() ? v : null;
  });
  protected readonly kocView = computed(() => {
    const v = this.view();
    // A rodada encerrada dá lugar à classificação — as duas na tela seriam duas verdades
    // disputando o mesmo espaço. Final encerrada também: só o pódio.
    return v?.kind === 'koc' && !this.standings() && !this.finalEncerrada() ? v : null;
  });

  /** Elenco da rodada que ainda não começou — antes do apito não há rei nem desafiante, e sem
   *  isto a tela ficava vazia. */
  protected readonly preRound = computed(() => {
    if (this.finalEncerrada()) return null;
    const m = this.match();
    return m ? kocPreRoundOf(m) : null;
  });

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
  protected readonly campeoes = computed<FinalCampeoes | null>(() => {
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

  /** Classificação da rodada KOTC encerrada. */
  protected readonly standings = computed(() => {
    const m = this.match();
    if (!m || !isKingOfCourtMatchType(m.matchType) || m.status !== 'completed') return null;
    if (this.campeoes()) return null;
    return kocStandingsBoardOf(m, this.gateway.categoryMatches());
  });

  /** Quadro das classificadas da fase — só existe junto com a classificação da rodada. */
  private readonly qualified = computed(() => {
    const m = this.match();
    if (!m || !this.standings()) return null;
    return kocQualifiedBoardOf(m, this.gateway.categoryMatches());
  });

  protected readonly telaDoResultado = computed(() =>
    this.telaEfetiva() === 'resultado' ? this.standings() : null,
  );
  protected readonly telaDasClassificadas = computed(() =>
    this.telaEfetiva() === 'classificadas' ? this.qualified() : null,
  );

  /** Só há o que alternar no fim da rodada, quando existem as duas telas. */
  protected readonly podeAlternar = computed(() => this.standings() != null);

  protected alternar(): void {
    this.manual.set(this.telaEfetiva() === 'resultado' ? 'classificadas' : 'resultado');
  }

  protected aoTeclar(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'd' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      this.mostrarDoacao();
      return;
    }
    if (key === 'o' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      this.desligarDoacao();
      return;
    }
    if (!this.podeAlternar()) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    this.alternar();
  }

  /** Config viva — `NXOverlay.set({ doacao: { ... } })` atualiza no ar. */
  protected readonly doacaoConfig = signal<OverlayDoacaoConfig>(getOverlaySettings().doacao);
  private readonly doacaoCycle = signal<DoacaoCycleState>(doacaoCycleStop());
  protected readonly doacaoShow = computed(() => this.doacaoCycle().show);
  private doacaoTimer: ReturnType<typeof setTimeout> | null = null;

  private doacaoInput() {
    const cfg = this.doacaoConfig();
    return {
      enabled: cfg.enabled,
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

  protected desligarDoacao(): void {
    this.runDoacao(doacaoCycleStop());
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

  /** Preferência do painel / outro overlay (`null` = seguir o matchType). */
  private readonly finalPref = signal<boolean | null>(null);

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
    installNxOverlay();

    // Rodízio entre as duas telas do fim de rodada. A dependência é uma CHAVE ESTÁVEL (o id da
    // partida encerrada), não um computed que muda a cada snapshot — senão o timer reinicia pra
    // sempre e nenhuma tela chega a trocar.
    effect((onCleanup) => {
      const chave = this.chaveDoRodizio();
      this.telaKoc.set('resultado');
      // Visualização fixada na URL ou escolhida na mão não reveza.
      if (!chave || this.telaFixa() || this.manual()) return;
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
      const quadra = this.courtId();
      const torneio = this.tournamentId();
      if (quadra && torneio) {
        onCleanup(this.gateway.startCourt(torneio, quadra));
        return;
      }
      const id = this.matchId();
      if (!id) return;
      onCleanup(this.gateway.start(id));
    });

    // Modo final compartilhado: painel e overlays da mesma origem leem o mesmo storage e
    // escutam o BroadcastChannel — ligar num liga nos outros.
    effect((onCleanup) => {
      const tid = (this.match()?.tournamentId || this.tournamentId() || '').trim();
      this.finalPref.set(tid ? readOverlayFinalPref(tid) : null);
      if (!tid || typeof BroadcastChannel === 'undefined') return;
      const ch = new BroadcastChannel(OVERLAY_FINAL_CHANNEL);
      ch.onmessage = (ev: MessageEvent<OverlayFinalMsg>) => {
        if (ev.data?.tournamentId !== tid) return;
        this.finalPref.set(ev.data.on);
      };
      onCleanup(() => ch.close());
    });

    // Doação PIX: config + ciclo 3 s → 20 s on → 90 s off.
    effect((onCleanup) => {
      onCleanup(
        subscribeOverlaySettings((s) => {
          this.doacaoConfig.set(s.doacao);
          this.runDoacao(doacaoCycleStart(this.doacaoInput()));
        }),
      );
      onCleanup(
        bindOverlayDoacaoControls({
          show: () => this.mostrarDoacao(),
          hide: () => this.desligarDoacao(),
        }),
      );
      this.runDoacao(doacaoCycleStart(this.doacaoInput()));
      onCleanup(() => this.clearDoacaoTimer());
    });

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
