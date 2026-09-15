import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TournamentSummary } from '../../../lib/firestore/types';
import { TournamentCard } from './tournament-card';
import { TournamentHero } from './tournament-hero';

function torneio(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Etapa Areia',
    sport: 'beachVolleyball',
    city: 'Goiânia',
    state: 'GO',
    locationName: 'Arena Sul',
    dateLabel: '21/04',
    startAt: null,
    endAt: null,
    listingStatus: 'open',
    featured: false,
    enrolledCount: 0,
    capacity: null,
    liveMatchesNow: 0,
    categoriesCount: 0,
    leagueId: null,
    leagueStageName: null,
    coverUrl: null,
    ...overrides,
  };
}

describe('capa padrão do torneio no site', () => {
  beforeEach(async () => {
    // O site roda zoneless: sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [TournamentCard, TournamentHero],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  function srcDaCapa(host: HTMLElement): string | null {
    return host.querySelector('img')?.getAttribute('src') ?? null;
  }

  it('card sem capa usa a arte do esporte', () => {
    const f = TestBed.createComponent(TournamentCard);
    f.componentRef.setInput('t', torneio());
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBe('/media/tournament-covers/volei_praia.webp');
  });

  it('a arte não substitui a capa que o organizador subiu', () => {
    const f = TestBed.createComponent(TournamentCard);
    f.componentRef.setInput('t', torneio({ coverUrl: 'https://cdn.example.com/capa.jpg' }));
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBe('https://cdn.example.com/capa.jpg');
  });

  it('torneio sem esporte reconhecido segue no gradiente', () => {
    const f = TestBed.createComponent(TournamentCard);
    f.componentRef.setInput('t', torneio({ sport: '' }));
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBeNull();
  });

  it('herói do torneio sem capa usa a arte do esporte', () => {
    const f = TestBed.createComponent(TournamentHero);
    f.componentRef.setInput('t', torneio({ sport: 'footvolley' }));
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBe('/media/tournament-covers/futevolei.webp');
  });
});
