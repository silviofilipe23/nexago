import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TournamentCard } from '../../torneios/tournament-card';
import { getFollowedTournamentIds } from '../../../../lib/follow-storage';
import { getTournamentById } from '../../../../lib/firestore/tournaments';
import { visibleFollowedTournaments } from './acompanhando-selectors';
import type { TournamentSummary } from '../../../../lib/firestore/types';

/**
 * "Torneios que você acompanha" — só aparece pra quem já seguiu pelo menos um torneio
 * (`follow-storage.ts`, sem conta). Sem seguidos, a seção não renderiza nada.
 */
@Component({
  selector: 'app-acompanhando-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, TournamentCard],
  template: `
    @if (tournaments().length > 0) {
      <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div nxReveal>
          <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
            Seus torneios
          </p>
          <h2
            class="font-display text-[clamp(1.7rem,4.5vw,2.5rem)] font-700 leading-tight tracking-tight text-fg"
          >
            Torneios que você acompanha
          </h2>
        </div>
        <ul class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (t of tournaments(); track t.id) {
            <li class="h-full">
              <app-tournament-card [t]="t" />
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class AcompanhandoSection {
  protected readonly tournaments = signal<TournamentSummary[]>([]);

  constructor() {
    const ids = getFollowedTournamentIds();
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => getTournamentById(id))).then((results) => {
      this.tournaments.set(visibleFollowedTournaments(results));
    });
  }
}
