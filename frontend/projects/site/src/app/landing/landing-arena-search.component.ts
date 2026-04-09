import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { MOCK_ARENAS, SMART_SEARCH_CHIPS, type SearchSmartChip } from './data/arenas.mock';
import { APP_LINKS } from './data/links';
import { RevealDirective } from './ui/reveal.directive';

@Component({
  selector: 'app-landing-arena-search',
  standalone: true,
  imports: [RevealDirective],
  templateUrl: './landing-arena-search.component.html',
  styleUrl: './landing-arena-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingArenaSearchComponent {
  readonly links = APP_LINKS;
  readonly smartChips = SMART_SEARCH_CHIPS;
  readonly allArenas = MOCK_ARENAS;

  readonly query = signal('');
  readonly isLoading = signal(false);
  readonly filterPopularOnly = signal(false);
  readonly onlyAvailable = signal(false);
  readonly sortBy = signal<'recommended' | 'price' | 'rating'>('recommended');

  private searchDebounceId: ReturnType<typeof globalThis.setTimeout> | undefined;

  readonly filteredArenas = computed(() => {
    let list = [...this.allArenas];
    if (this.filterPopularOnly()) {
      list = list.filter((a) => a.badge === 'popular');
    }
    if (this.onlyAvailable()) {
      list = list.filter((a) => a.available);
    }
    const q = this.query().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.state.toLowerCase().includes(q),
      );
    }
    if (this.sortBy() === 'price') {
      list.sort((a, b) => a.pricePerHourReais - b.pricePerHourReais);
    } else if (this.sortBy() === 'rating') {
      list.sort((a, b) => b.rating - a.rating);
    } else {
      list.sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return list;
  });

  badgeLabel(kind: 'popular' | 'rating'): string {
    return kind === 'popular' ? 'Mais reservada' : 'Top rating';
  }

  setQuery(v: string): void {
    this.filterPopularOnly.set(false);
    this.scheduleSearchUpdate(v);
  }

  toggleOnlyAvailable(): void {
    this.onlyAvailable.update((v) => !v);
  }

  setSortBy(v: 'recommended' | 'price' | 'rating'): void {
    this.sortBy.set(v);
  }

  applySmartChip(chip: SearchSmartChip): void {
    if (chip.kind === 'tournament_nav') {
      globalThis.document.getElementById('torneios')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (chip.kind === 'trend') {
      this.filterPopularOnly.set(true);
      this.scheduleSearchUpdate('');
      return;
    }
    this.filterPopularOnly.set(false);
    this.scheduleSearchUpdate(chip.query);
  }

  private scheduleSearchUpdate(value: string): void {
    this.isLoading.set(true);
    globalThis.clearTimeout(this.searchDebounceId);
    this.searchDebounceId = globalThis.setTimeout(() => {
      this.query.set(value);
      this.isLoading.set(false);
      this.searchDebounceId = undefined;
    }, 200);
  }
}
