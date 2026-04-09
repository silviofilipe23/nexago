import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { MOCK_TOURNAMENTS } from './data/tournaments.mock';
import type { TournamentGender } from './data/tournaments.mock';
import { APP_LINKS } from './data/links';
import { RevealDirective } from './ui/reveal.directive';

export type TournamentFilterId = 'all' | 'masculino' | 'feminino' | 'iniciante';

@Component({
  selector: 'app-landing-tournaments',
  standalone: true,
  imports: [RevealDirective],
  templateUrl: './landing-tournaments.component.html',
  styleUrl: './landing-tournaments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingTournamentsComponent {
  readonly links = APP_LINKS;
  readonly allTournaments = MOCK_TOURNAMENTS;

  readonly filterId = signal<TournamentFilterId>('all');

  readonly filterOptions: { id: TournamentFilterId; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'masculino', label: 'Masculino' },
    { id: 'feminino', label: 'Feminino' },
    { id: 'iniciante', label: 'Iniciante' },
  ];

  readonly filteredTournaments = computed(() => {
    const f = this.filterId();
    if (f === 'all') {
      return this.allTournaments;
    }
    if (f === 'iniciante') {
      return this.allTournaments.filter((t) => t.level.toLowerCase().includes('iniciante'));
    }
    if (f === 'masculino' || f === 'feminino') {
      return this.allTournaments.filter((t) => t.gender === f);
    }
    return this.allTournaments;
  });

  setFilter(id: TournamentFilterId): void {
    this.filterId.set(id);
  }

  isFilterActive(id: TournamentFilterId): boolean {
    return this.filterId() === id;
  }

  filterChipClass(id: TournamentFilterId): string {
    const base =
      'rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60';
    if (this.filterId() === id) {
      return `${base} border-violet-500/50 bg-violet-500/20 text-white`;
    }
    return `${base} border-white/15 bg-white/[0.04] text-slate-300 hover:border-violet-500/35 hover:bg-white/[0.07] hover:text-white`;
  }

  genderLine(g: TournamentGender): string {
    switch (g) {
      case 'masculino':
        return 'Masculino';
      case 'feminino':
        return 'Feminino';
      case 'misto':
        return 'Misto';
    }
  }

  formatDate(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso + 'T12:00:00'));
  }
}
