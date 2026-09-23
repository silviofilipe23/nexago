import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { isKingOfCourtMatchType, kocColumnLabel } from '../../painel/data/koc';
import { resolveCourtNames } from '../../painel/data/matches-repository';
import { OverlayLiveGateway } from './overlay-live.gateway';
import { OverlayKocBarComponent } from './overlay-koc-bar.component';
import { kocQualifiedBoardOf } from './overlay-koc-qualified';
import { OverlayKocQualifiedComponent } from './overlay-koc-qualified.component';
import { kocStandingsBoardOf } from './overlay-koc-standings';
import { OverlayKocStandingsComponent } from './overlay-koc-standings.component';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
import { overlayBandOf, overlayCornerOf, overlayViewOf } from './overlay-selectors';

type TelaKoc = 'resultado' | 'classificadas';

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
  ],
  providers: [OverlayLiveGateway],
  template: `
    @if (duelView(); as duel) {
      <og-overlay-scoreboard
        [view]="duel"
        [band]="band()"
        [corner]="corner()"
        [teamLabels]="teamLabels()"
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
    @if (kocView(); as koc) {
      <og-overlay-koc-bar
        [view]="koc"
        [teams]="gateway.teams()"
        [categoryName]="categoryName()"
        [courtName]="courtName()"
        [position]="kocPosition()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class OverlayPageComponent {
  /** Params da rota chegam por `withComponentInputBinding` — `input()`, nunca `signal()`. */
  readonly matchId = input('');
  readonly pos = input<string | null>(null);

  protected readonly gateway = inject(OverlayLiveGateway);

  private readonly telaKoc = signal<TelaKoc>('resultado');

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

  /** O estreitamento fica no TS; cada formato tem seu componente, não um ramo do outro. */
  protected readonly duelView = computed(() => {
    const v = this.view();
    return v?.kind === 'duel' ? v : null;
  });
  protected readonly kocView = computed(() => {
    const v = this.view();
    // A rodada encerrada dá lugar à classificação — as duas na tela seriam duas verdades
    // disputando o mesmo espaço.
    return v?.kind === 'koc' && !this.standings() ? v : null;
  });

  /** Classificação da rodada KOTC encerrada. */
  protected readonly standings = computed(() => {
    const m = this.match();
    if (!m || !isKingOfCourtMatchType(m.matchType) || m.status !== 'completed') return null;
    return kocStandingsBoardOf(m, this.gateway.categoryMatches());
  });

  /** Quadro das classificadas da fase — só existe junto com a classificação da rodada. */
  private readonly qualified = computed(() => {
    const m = this.match();
    if (!m || !this.standings()) return null;
    return kocQualifiedBoardOf(m, this.gateway.categoryMatches());
  });

  protected readonly telaDoResultado = computed(() =>
    this.telaKoc() === 'resultado' ? this.standings() : null,
  );
  protected readonly telaDasClassificadas = computed(() =>
    this.telaKoc() === 'classificadas' ? this.qualified() : null,
  );

  protected readonly phaseName = computed(() => {
    const m = this.match();
    return m ? kocColumnLabel(m.matchType) : null;
  });

  protected readonly roundLabel = computed(() => this.match()?.koc?.roundLabel ?? 0);

  /** O placar de duelo só precisa do rótulo combinado da dupla. */
  protected readonly teamLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const [teamId, team] of this.gateway.teams()) labels.set(teamId, team.label);
    return labels;
  });

  protected readonly categoryName = computed(() => {
    const m = this.match();
    const tournament = this.gateway.tournament();
    return tournament?.categories.find((c) => c.id === m?.categoryId)?.name ?? null;
  });

  protected readonly courtName = computed(() => this.match()?.court ?? null);

  /** A faixa do KOTC ocupa a largura toda: só aceita subir ou descer. */
  protected readonly kocPosition = computed<'top' | 'bottom'>(() =>
    this.pos() === 'top' ? 'top' : 'bottom',
  );

  private readonly view = computed(() => {
    const m = this.match();
    if (!m) return null;
    // Só a rodada KOTC tem relógio. Ler o tique num duelo faria a tela recalcular a cada
    // segundo sem nada mudar.
    const nowMs = isKingOfCourtMatchType(m.matchType) ? this.tick() : 0;
    return overlayViewOf(m, nowMs, this.gateway.totalRounds());
  });

  protected readonly band = computed(() => {
    const m = this.match();
    if (!m) return '';
    return overlayBandOf(m, {
      tournamentName: this.gateway.tournament()?.name ?? null,
      categoryName: this.categoryName(),
    });
  });

  constructor() {
    // Rodízio entre as duas telas do fim de rodada. A dependência é uma CHAVE ESTÁVEL (o id da
    // partida encerrada), não um computed que muda a cada snapshot — senão o timer reinicia pra
    // sempre e nenhuma tela chega a trocar.
    effect((onCleanup) => {
      const chave = this.chaveDoRodizio();
      this.telaKoc.set('resultado');
      if (!chave) return;
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
      const id = this.matchId();
      if (!id) return;
      onCleanup(this.gateway.start(id));
    });

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
