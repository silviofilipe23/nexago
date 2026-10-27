import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  ARENA_AMENITIES_EMPTY,
  arenaListItemImageUrl,
  type ArenaListItem,
  type ArenaSearchResult,
} from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { LocationMapComponent } from '../shared/location-map/location-map.component';
import { ArenaDetailComponent } from './arena-detail.component';
import { AthleteReservarComponent } from './athlete-reservar.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

@Component({ selector: 'app-location-map', template: '' })
class LocationMapStubComponent {
  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly label = input('arena');
  readonly googleMapsApiKey = input('');
}

const firebase = environment.firebase as { apiKey: string };
const COVER = 'https://firebasestorage.googleapis.com/v0/b/x/o/arenas%2Fa1%2Fcover';

function arena(overrides: Partial<ArenaListItem> = {}): ArenaListItem {
  return {
    id: 'a1',
    name: 'Arena Sol',
    locationLabel: 'Goiânia, GO',
    coverUrl: null,
    logoUrl: null,
    pricePerHourReais: 80,
    description: null,
    city: 'Goiânia',
    state: 'GO',
    galleryImageUrls: [],
    ratingAverage: 4.5,
    reviewsCount: 10,
    lat: null,
    lng: null,
    courtTypes: ['Vôlei de praia'],
    surfaces: ['Areia'],
    reputationScore: 90,
    onlinePaymentEnabled: true,
    onsitePaymentEnabled: true,
    amenities: ARENA_AMENITIES_EMPTY,
    phone: null,
    whatsapp: null,
    isUnclaimed: false,
    ...overrides,
  };
}

function result(item: ArenaListItem): ArenaSearchResult {
  return {
    arena: item,
    selectedSlot: null,
    courtName: null,
    isExactMatch: false,
    minutesDistance: null,
    displayPricePerHourReais: 80,
    showStartingFrom: false,
    hasAvailability: false,
    courtCount: 2,
  };
}

describe('arena sem capa', () => {
  // Sem chave de Firebase as telas não leem nada: os dados são semeados à mão depois do 1º ciclo.
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(null), devEmail: signal(null) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ arenaId: 'a1' }), queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  it('não ganha foto genérica: a URL da capa é a dela ou nenhuma', () => {
    expect(arenaListItemImageUrl(arena())).toBeNull();
    expect(arenaListItemImageUrl(arena({ coverUrl: COVER }))).toBe(COVER);
  });

  describe('na busca', () => {
    interface Internals {
      searchResults: WritableSignal<ArenaSearchResult[]>;
      searchError: WritableSignal<string | null>;
      loadingResults: WritableSignal<boolean>;
    }

    function render(items: ArenaListItem[]): HTMLElement {
      TestBed.overrideComponent(AthleteReservarComponent, {
        remove: { imports: [AtPanelShellComponent] },
        add: { imports: [PanelShellStubComponent] },
      });
      const fixture = TestBed.createComponent(AthleteReservarComponent);
      const internals = fixture.componentInstance as unknown as Internals;
      fixture.detectChanges();
      internals.searchError.set(null);
      internals.loadingResults.set(false);
      internals.searchResults.set(items.map(result));
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('o card fica no gradiente da arena, sem <img> nem skeleton eterno', () => {
      const hero = render([arena()]).querySelector<HTMLElement>('.rv-card-hero');
      expect(hero).not.toBeNull();
      expect(hero!.querySelector('img')).toBeNull();
      expect(hero!.querySelector('.rv-hero-skeleton')).toBeNull();
      expect(hero!.style.background).toContain('gradient');
    });

    it('com capa, o card mostra a foto dela', () => {
      const img = render([arena({ coverUrl: COVER })]).querySelector<HTMLImageElement>('.rv-card-hero img');
      expect(img?.getAttribute('src')).toBe(COVER);
    });
  });

  describe('no detalhe', () => {
    interface Internals {
      arena: WritableSignal<ArenaListItem | null>;
      error: WritableSignal<string | null>;
      loading: WritableSignal<boolean>;
    }

    function render(item: ArenaListItem): HTMLElement {
      TestBed.overrideComponent(ArenaDetailComponent, {
        remove: { imports: [AtPanelShellComponent, LocationMapComponent] },
        add: { imports: [PanelShellStubComponent, LocationMapStubComponent] },
      });
      const fixture = TestBed.createComponent(ArenaDetailComponent);
      const internals = fixture.componentInstance as unknown as Internals;
      fixture.detectChanges();
      internals.error.set(null);
      internals.loading.set(false);
      internals.arena.set(item);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('o herói fica no gradiente da arena, sem <img>', () => {
      const hero = render(arena()).querySelector<HTMLElement>('.ad-hero');
      expect(hero).not.toBeNull();
      expect(hero!.querySelector('.ad-hero-img')).toBeNull();
      expect(hero!.style.background).toContain('gradient');
    });

    it('com capa, o herói mostra a foto dela', () => {
      const img = render(arena({ coverUrl: COVER })).querySelector<HTMLImageElement>('.ad-hero-img');
      expect(img?.getAttribute('src')).toBe(COVER);
    });
  });
});
