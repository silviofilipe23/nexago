import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { isKingOfCourtMatchType } from '../../painel/data/koc';
import { resolveCourtNames } from '../../painel/data/matches-repository';
import { OverlayLiveGateway } from './overlay-live.gateway';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
import { overlayBandOf, overlayCornerOf, overlayViewOf } from './overlay-selectors';

/** Rota PÚBLICA `/overlay/:matchId` — o Browser Source do OBS, que não tem sessão.
 *
 *  Lê só coleções com `read: if true` (matches, teams, public_profiles, tournaments), as
 *  mesmas da página de acompanhamento `/t/:tournamentId`. Nenhuma regra nova de Firestore. */
@Component({
  selector: 'og-overlay-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayScoreboardComponent],
  providers: [OverlayLiveGateway],
  template: `
    <og-overlay-scoreboard
      [view]="view()"
      [band]="band()"
      [corner]="corner()"
      [teamLabels]="gateway.teamLabels()"
    />
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

  protected readonly view = computed(() => {
    const m = this.match();
    if (!m) return null;
    // Só a rodada KOTC tem relógio. Ler o tique num duelo faria a tela recalcular a cada
    // segundo sem nada mudar.
    const nowMs = isKingOfCourtMatchType(m.matchType) ? this.tick() : 0;
    return overlayViewOf(m, nowMs);
  });

  protected readonly band = computed(() => {
    const m = this.match();
    if (!m) return '';
    const tournament = this.gateway.tournament();
    return overlayBandOf(m, {
      tournamentName: tournament?.name ?? null,
      categoryName: tournament?.categories.find((c) => c.id === m.categoryId)?.name ?? null,
    });
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.matchId();
      if (!id) return;
      onCleanup(this.gateway.start(id));
    });

    const handle = setInterval(() => this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
