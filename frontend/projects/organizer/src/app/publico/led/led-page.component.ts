import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { kocColumnLabel } from '../../painel/data/koc';
import { TelaoDataService } from '../../painel/telao/telao-data.service';
import { finishedAtOf } from '../../painel/telao/telao-finished';
import { overlayCourtContextOf } from '../overlay/overlay-court';
import { kocRoundTitleOf } from '../overlay/overlay-koc-bar';
import { kocStandingsBoardOf } from '../overlay/overlay-koc-standings';
import { overlayViewOf } from '../overlay/overlay-selectors';
import { LedProximosComponent } from './led-proximos.component';
import { ledProximosOf } from './led-proximos';
import { LedRoundComponent, type LedRoundInfo, type LedTeam } from './led-round.component';
import { LedStandingsComponent } from './led-standings.component';
import { ledIniciaisDe } from './led-iniciais';
import { PROXIMOS_MS, ledTelaOf, type LedTela } from './led-telas';

/** Painel de LED da quadra: `/led/:tournamentId/quadra/:courtId`.
 *
 *  Segue a QUADRA, não uma partida fixa — é o que permite emendar a rodada seguinte sozinho, que
 *  é a razão de o painel existir. Por isso reusa o `TelaoDataService` (torneio inteiro + nomes +
 *  memória de fim de partida) e o `courtNowOf` do telão, em vez de um listener de doc único como
 *  o overlay do OBS. */
@Component({
  selector: 'og-led-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TelaoDataService],
  imports: [LedRoundComponent, LedStandingsComponent, LedProximosComponent],
  host: {
    '(document:keydown)': 'aoTeclar($event)',
  },
  template: `
    <!-- Tela lógica de no mínimo 1920×1080, na PROPORÇÃO da TV, reduzida por escala. As telas
         foram desenhadas em px pra 1920×1080; numa TV 4:3 (1024×768) a tela lógica vira
         1920×1440 — sem faixa preta, e a altura a mais vai pras áreas flexíveis. O transform
         também faz o position: fixed das telas se referir a esta caixa, não à janela. -->
    <div
      class="palco"
      [style.width.px]="palco().w"
      [style.height.px]="palco().h"
      [style.transform]="'scale(' + palco().s + ')'"
    >
    @switch (tela()) {
      @case ('elenco') {
        @if (proximos(); as px) {
          <div class="cortina" animate.enter="led-cortina-in" animate.leave="led-cortina-out">
            <og-led-proximos
              [proximos]="px"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [courtName]="courtName()"
              [roundTitle]="roundTitle()"
              [rodada]="rodadaDoInicio()"
            />
          </div>
        }
      }
      @case ('proximos') {
        @if (proximos(); as px) {
          <div class="cortina" animate.enter="led-cortina-in" animate.leave="led-cortina-out">
            <og-led-proximos
              [proximos]="px"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [courtName]="courtName()"
              [roundTitle]="roundTitle()"
              [rodada]="rodadaDoInicio()"
            />
          </div>
        }
      }
      @case ('jogo') {
        @if (view(); as v) {
          <div class="cortina" animate.enter="led-cortina-in" animate.leave="led-cortina-out">
            <og-led-round
              [view]="v"
              [info]="roundInfo()"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [courtName]="courtName()"
            />
          </div>
        }
      }
      @case ('tempo-esgotado') {
        @if (view(); as v) {
          <div class="cortina" animate.enter="led-cortina-in" animate.leave="led-cortina-out">
            <og-led-round
              [view]="v"
              [info]="roundInfo()"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [courtName]="courtName()"
              [esgotado]="true"
            />
          </div>
        }
      }
      @case ('classificadas') {
        <!-- A tela das classificadas da fase ainda não tem versão de LED. Até ter, esta janela
             segura a classificação da rodada: informação verdadeira por mais tempo é melhor que
             painel preto no meio do ginásio. -->
        @if (standings(); as board) {
          <div class="cortina" animate.enter="led-cortina-in" animate.leave="led-cortina-out">
            <og-led-standings
              [board]="board"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [roundLabel]="roundLabel()"
            />
          </div>
        }
      }
      @case ('classificacao') {
        @if (standings(); as board) {
          <div class="cortina" animate.enter="led-cortina-in" animate.leave="led-cortina-out">
            <og-led-standings
              [board]="board"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [roundLabel]="roundLabel()"
            />
          </div>
        }
      }
    }
    </div>

    <!-- "6 próximos" sem teclado (TV com mouse): canto superior esquerdo, invisível. -->
    <button type="button" class="hot" aria-label="Mostrar próximos em quadra" (click)="mostrarProximos()"></button>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
    }

    .hot {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 5;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
    }

    .palco {
      position: absolute;
      top: 0;
      left: 0;
      overflow: hidden;
      transform-origin: 0 0;
    }

    .cortina {
      position: absolute;
      inset: 0;
    }

    /* Cortina da esquerda para a direita na entrada; a tela que sai some em 300ms. */
    .led-cortina-in {
      animation: led-cortina 500ms cubic-bezier(0.7, 0, 0.3, 1) both;
    }
    .led-cortina-out {
      animation: led-cortina-out 300ms ease-out both;
    }
    @keyframes led-cortina {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }
    @keyframes led-cortina-out {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .led-cortina-in,
      .led-cortina-out {
        animation: none;
      }
    }
  `,
})
export class LedPageComponent {
  readonly tournamentId = input('');
  readonly courtId = input('');

  private readonly dados = inject(TelaoDataService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Tamanho da janela — a TV do ginásio, que não é sempre Full HD. */
  private readonly janela = signal({ w: 1920, h: 1080 });

  /** Tela lógica: a escala é a do lado mais apertado em relação a 1920×1080, e o outro lado
   *  cresce pra preencher a proporção da TV. 1920×1080 → escala 1, nada muda. */
  protected readonly palco = computed(() => {
    const { w, h } = this.janela();
    const s = Math.min(w / 1920, h / 1080) || 1;
    return { s, w: w / s, h: h / s };
  });
  private readonly tick = signal(Date.now());

  /** O que está nesta quadra agora — ao vivo, recém-encerrada ou a próxima — com o contexto de
   *  fase junto. MESMA função do overlay por quadra: a regra de "qual partida" vive num lugar só. */
  private readonly contexto = computed(() =>
    overlayCourtContextOf(
      this.dados.matches(),
      this.courtId(),
      this.tick(),
      this.dados.finishMemory(),
    ),
  );
  private readonly partida = computed(() => this.contexto().match);

  private readonly finishedAt = computed(() => {
    const m = this.partida();
    return m ? finishedAtOf(this.dados.finishMemory(), m.id) : null;
  });

  /** Até quando o "6 próximos" manual segura a tela (epoch ms). */
  private readonly proximosManualAte = signal(0);

  protected readonly proximos = computed(() => ledProximosOf(this.partida()));

  protected readonly tela = computed<LedTela>(() => {
    const auto = ledTelaOf(this.partida(), this.tick(), this.finishedAt());
    // Manual só onde há quem anunciar; antes do apito a tela de elenco já é esta.
    if (this.tick() < this.proximosManualAte() && this.proximos() && auto !== 'elenco') return 'proximos';
    return auto;
  });

  /** Tecla 6 ou o botão invisível: 12 s de "Próximos em quadra" e volta ao automático. */
  protected mostrarProximos(): void {
    const now = Date.now();
    this.proximosManualAte.set(now + PROXIMOS_MS);
    this.tick.set(now);
  }

  protected aoTeclar(event: KeyboardEvent): void {
    if (event.key === '6' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      this.mostrarProximos();
    }
  }

  private readonly totalRounds = computed(() => this.contexto().totalRounds);

  /** Só a visão de KOTC interessa aqui: o painel é do formato King of the Court. Uma partida de
   *  duelo na quadra não tem tela neste painel (ver `ledTelaOf`). */
  protected readonly view = computed(() => {
    const v = overlayViewOf(this.partida(), this.tick(), this.totalRounds());
    return v?.kind === 'koc' ? v : null;
  });

  protected readonly standings = computed(() => {
    const m = this.partida();
    if (!m || m.status !== 'completed') return null;
    return kocStandingsBoardOf(m, this.contexto().categoryMatches);
  });

  /** Nomes + foto de perfil — o painel mostra a cara de quem está em quadra. */
  protected readonly teams = computed<ReadonlyMap<string, LedTeam>>(() => {
    const out = new Map<string, LedTeam>();
    for (const [teamId, display] of this.dados.teams()) {
      const names = display.playerNames.filter((n) => !!n?.trim());
      const profiles = display.players;
      out.set(teamId, {
        players: names.map((name, i) => ({
          name,
          initials: profiles[i]?.initials || ledIniciaisDe(name),
          photoUrl: profiles[i]?.photoUrl ?? null,
        })),
      });
    }
    return out;
  });

  protected readonly categoryName = computed(() => {
    const m = this.partida();
    return this.dados.tournament()?.categories.find((c) => c.id === m?.categoryId)?.name ?? null;
  });

  protected readonly courtName = computed(() => {
    const m = this.partida();
    if (m?.court) return m.court;
    return this.dados.tournament()?.courts.find((c) => c.id === this.courtId())?.name ?? null;
  });

  protected readonly roundLabel = computed(() => this.partida()?.koc?.roundLabel ?? 0);

  /** Selo "INÍCIO DA …" da tela de próximos. Com bateria, "Rodada 9" não diz nada — o painel
   *  inteiro localiza a rodada por chave e bateria. */
  protected readonly rodadaDoInicio = computed(() => {
    const koc = this.partida()?.koc;
    if (!koc) return '';
    if ((koc.batteryLabel ?? 1) > 1) return `Bateria ${koc.batteryLabel}`;
    return koc.roundLabel > 0 ? `Rodada ${koc.roundLabel}` : '';
  });

  /** "Rodada 3/7". NÃO sai de `view()`: antes do apito ela é nula, e o cabeçalho do elenco
   *  ficaria sem a rodada justamente na tela em que ela importa. */
  protected readonly roundTitle = computed(() => {
    const m = this.partida();
    if (!m) return '';
    return kocRoundTitleOf(
      m.matchType,
      m.koc?.roundLabel ?? 0,
      m.matchNumber,
      this.contexto().totalRounds,
      {
        poolId: m.koc?.poolId,
        batteryLabel: m.koc?.batteryLabel,
        bracketsInPhase: m.koc?.bracketsInPhase,
      },
    );
  });

  /** A rodada em CAMPOS pro cabeçalho do painel. O painel já teve que extrair
   *  chave, bateria e total do título com expressão regular — e ficou mudo no
   *  dia em que o rótulo mudou de forma. Aqui tudo isso já existe pronto. */
  protected readonly roundInfo = computed<LedRoundInfo | null>(() => {
    const m = this.partida();
    if (!m) return null;
    return {
      matchType: m.matchType,
      roundLabel: m.koc?.roundLabel ?? 0,
      batteryLabel: m.koc?.batteryLabel ?? 1,
      poolId: m.koc?.poolId ?? '',
      totalRounds: this.contexto().totalRounds,
      bracketsInPhase: m.koc?.bracketsInPhase ?? 0,
    };
  });

  protected readonly phaseName = computed(() => {
    const m = this.partida();
    return m ? kocColumnLabel(m.matchType) : null;
  });

  constructor() {
    effect(() => this.dados.tournamentId.set(this.tournamentId() || null));

    afterNextRender(() => {
      const el = this.host.nativeElement;
      const medir = () => this.janela.set({ w: el.clientWidth || 1920, h: el.clientHeight || 1080 });
      medir();
      const obs = new ResizeObserver(medir);
      obs.observe(el);
      this.destroyRef.onDestroy(() => obs.disconnect());
    });

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(handle));
  }
}
