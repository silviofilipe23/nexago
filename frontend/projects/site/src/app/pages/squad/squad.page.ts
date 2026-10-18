import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { getSquadAmbassadors } from '../../../lib/firestore/squad';
import {
  SQUAD_JOIN_URL,
  TIER_META,
  TIER_ORDER,
  arenaCount,
  citiesByCount,
  matchesFilter,
  regionLabel,
  tierCounts,
  type SquadAmbassador,
  type SquadTier,
} from '../../../lib/squad';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { SquadCaptainCard, SquadCard } from './squad-card';
import { SquadPhoto } from './squad-photo';

/** Cards visíveis antes do "Ver mais". */
const PAGE_SIZE = 8;
/** Fotos no mosaico do topo. */
const MOSAIC_SIZE = 6;

interface TierChip {
  id: SquadTier | 'all';
  label: string;
}

const CHIPS: TierChip[] = [
  { id: 'all', label: 'Todos' },
  ...TIER_ORDER.map((t) => ({ id: t, label: TIER_META[t].label })),
];

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * "Conheça o Squad" (`/squad`): página aberta, sem login, com os embaixadores ativos do NexaSquad.
 * Lê só o espelho público `squadPublic` (dados esportivos e código); cada código vira o link
 * `atleta.nexago.com.br/?squad=CODIGO`, que o portal do atleta já atribui.
 *
 * No desktop os Captains ganham seção própria (cards horizontais) e a grade mostra o resto; no
 * celular é uma lista só, como no desenho.
 */
@Component({
  selector: 'app-squad-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, SquadCard, SquadCaptainCard, SquadPhoto],
  templateUrl: './squad.page.html',
  styles: `
    .squad-hero-bg {
      background:
        radial-gradient(110% 120% at 0% 0%, color-mix(in srgb, var(--color-brand) 26%, transparent),
          color-mix(in srgb, var(--color-brand) 4%, transparent) 60%),
        var(--color-surface-0);
    }
    .squad-chips {
      scrollbar-width: none;
    }
    .squad-chips::-webkit-scrollbar {
      display: none;
    }
  `,
})
export class SquadPage {
  protected readonly joinUrl = SQUAD_JOIN_URL;
  protected readonly chips = CHIPS;
  protected readonly skeletons = [0, 1, 2, 3];

  protected readonly all = signal<SquadAmbassador[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly tier = signal<SquadTier | 'all'>('all');
  protected readonly city = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly expanded = signal(false);

  private readonly desktopQuery = window.matchMedia('(min-width: 1024px)');
  protected readonly desktop = signal(this.desktopQuery.matches);

  protected readonly region = computed(() => regionLabel(this.all()));
  protected readonly cities = computed(() => citiesByCount(this.all()));
  protected readonly stats = computed(() => {
    const list = this.all();
    const arenas = arenaCount(list);
    const cities = this.cities().length;
    return [
      { value: list.length, label: plural(list.length, 'embaixador', 'embaixadores') },
      { value: arenas, label: plural(arenas, 'arena', 'arenas') },
      { value: cities, label: plural(cities, 'cidade', 'cidades') },
    ].filter((s) => s.value > 0);
  });

  /** Fotos primeiro; quem não tem foto entra com as iniciais. */
  protected readonly mosaic = computed(() => {
    const list = this.all();
    return [...list.filter((a) => a.photoUrl), ...list.filter((a) => !a.photoUrl)].slice(0, MOSAIC_SIZE);
  });

  /** Cidade e busca valem para tudo; o nível só para a lista. Os números dos chips seguem a cidade/busca. */
  private readonly placeFiltered = computed(() =>
    this.all().filter((a) => matchesFilter(a, { tier: 'all', city: this.city(), query: this.query() })),
  );
  protected readonly counts = computed(() => tierCounts(this.placeFiltered()));
  private readonly filtered = computed(() => {
    const tier = this.tier();
    return tier === 'all' ? this.placeFiltered() : this.placeFiltered().filter((a) => a.tier === tier);
  });

  protected readonly captainSection = computed(() => this.desktop() && (this.tier() === 'all' || this.tier() === 'cap'));
  protected readonly captains = computed(() =>
    this.captainSection() ? this.filtered().filter((a) => a.tier === 'cap') : [],
  );
  /** Com a linha dos Captains cheia, "Lidera uma turma?" vira faixa na linha de baixo. */
  protected readonly captainStrip = computed(() => this.captains().length % 3 === 0);
  protected readonly gridList = computed(() =>
    this.captainSection() ? this.filtered().filter((a) => a.tier !== 'cap') : this.filtered(),
  );
  protected readonly visible = computed(() => (this.expanded() ? this.gridList() : this.gridList().slice(0, PAGE_SIZE)));
  protected readonly remaining = computed(() => this.gridList().length - this.visible().length);
  protected readonly gridTitle = computed(() => {
    const tier = this.tier();
    return tier === 'all' ? 'Todos os embaixadores' : TIER_META[tier].plural;
  });
  protected readonly gridCount = computed(() => {
    const n = this.gridList().length;
    return `${n} ${plural(n, 'atleta', 'atletas')}`;
  });
  protected readonly nothingFound = computed(() => this.filtered().length === 0);
  protected readonly hasFilters = computed(() => this.tier() !== 'all' || this.city() !== null || this.query().trim() !== '');

  constructor() {
    inject(Title).setTitle('NexaSquad · os embaixadores do nexaGO');
    const onChange = (e: MediaQueryListEvent) => this.desktop.set(e.matches);
    this.desktopQuery.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.desktopQuery.removeEventListener('change', onChange));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    getSquadAmbassadors()
      .then((list) => this.all.set(list))
      .catch((err) => {
        console.error('[squad] getSquadAmbassadors failed:', err);
        this.failed.set(true);
      })
      .finally(() => this.loading.set(false));
  }

  protected setTier(tier: SquadTier | 'all'): void {
    this.tier.set(tier);
    this.expanded.set(false);
  }

  protected setCity(value: string): void {
    this.city.set(value || null);
    this.expanded.set(false);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.expanded.set(false);
  }

  protected clearFilters(): void {
    this.tier.set('all');
    this.city.set(null);
    this.query.set('');
    this.expanded.set(false);
  }
}
