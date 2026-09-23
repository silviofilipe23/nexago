import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { kocColumnLabel } from '../../painel/data/koc';
import { TelaoDataService } from '../../painel/telao/telao-data.service';
import { courtNowOf } from '../../painel/telao/telao-selectors';
import { finishedAtOf } from '../../painel/telao/telao-finished';
import { kocStandingsBoardOf } from '../overlay/overlay-koc-standings';
import { overlayViewOf } from '../overlay/overlay-selectors';
import { LedRoundComponent, type LedTeam } from './led-round.component';
import { LedStandingsComponent } from './led-standings.component';
import { ledTelaOf } from './led-telas';

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
  imports: [LedRoundComponent, LedStandingsComponent],
  template: `
    @switch (tela()) {
      @case ('jogo') {
        @if (view(); as v) {
          <div class="cortina">
            <og-led-round
              [view]="v"
              [teams]="teams()"
              [categoryName]="categoryName()"
              [courtName]="courtName()"
            />
          </div>
        }
      }
      @case ('tempo-esgotado') {
        @if (view(); as v) {
          <div class="cortina">
            <og-led-round
              [view]="v"
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
          <div class="cortina">
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
          <div class="cortina">
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
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
    }

    /* Cortina da esquerda para a direita. Cada tela é um elemento novo no @switch, então a
       animação roda sozinha na troca — sem orquestração. */
    .cortina {
      position: absolute;
      inset: 0;
      animation: led-cortina 500ms cubic-bezier(0.7, 0, 0.3, 1) both;
    }
    @keyframes led-cortina {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .cortina {
        animation: none;
      }
    }
  `,
})
export class LedPageComponent {
  readonly tournamentId = input('');
  readonly courtId = input('');

  private readonly dados = inject(TelaoDataService);
  private readonly tick = signal(Date.now());

  /** O que está nesta quadra agora — ao vivo, recém-encerrada ou a próxima. */
  private readonly partida = computed(
    () =>
      courtNowOf(this.dados.matches(), this.courtId(), this.tick(), this.dados.finishMemory())
        .match,
  );

  private readonly finishedAt = computed(() => {
    const m = this.partida();
    return m ? finishedAtOf(this.dados.finishMemory(), m.id) : null;
  });

  protected readonly tela = computed(() =>
    ledTelaOf(this.partida(), this.tick(), this.finishedAt()),
  );

  private readonly totalRounds = computed(() => {
    const m = this.partida();
    if (!m) return 0;
    return this.dados.matches().filter((x) => x.categoryId === m.categoryId && x.matchType === m.matchType)
      .length;
  });

  /** Só a visão de KOTC interessa aqui: o painel é do formato King of the Court. Uma partida de
   *  duelo na quadra não tem tela neste painel (ver `ledTelaOf`). */
  protected readonly view = computed(() => {
    const v = overlayViewOf(this.partida(), this.tick(), this.totalRounds());
    return v?.kind === 'koc' ? v : null;
  });

  protected readonly standings = computed(() => {
    const m = this.partida();
    if (!m || m.status !== 'completed') return null;
    return kocStandingsBoardOf(
      m,
      this.dados.matches().filter((x) => x.categoryId === m.categoryId),
    );
  });

  /** O painel só precisa dos nomes; o `TelaoDataService` já resolve na ordem dos slots. */
  protected readonly teams = computed<ReadonlyMap<string, LedTeam>>(() => {
    const out = new Map<string, LedTeam>();
    for (const [teamId, display] of this.dados.teams()) out.set(teamId, { players: display.playerNames });
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

  protected readonly phaseName = computed(() => {
    const m = this.partida();
    return m ? kocColumnLabel(m.matchType) : null;
  });

  constructor() {
    effect(() => this.dados.tournamentId.set(this.tournamentId() || null));

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
