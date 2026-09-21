import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { LeagueSummary } from '../../../lib/firestore/types';
import { LeagueCard } from './league-card';
import { LeagueHero } from './league-hero';

function liga(overrides: Partial<LeagueSummary> = {}): LeagueSummary {
  return {
    id: 'l1',
    name: 'Liga nexaGO',
    seasonLabel: 'Temporada 2026',
    description: null,
    coverUrl: null,
    sport: 'beachVolleyball',
    stages: [],
    ...overrides,
  };
}

describe('capa padrão da liga no site', () => {
  beforeEach(async () => {
    // O site roda zoneless: sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [LeagueCard, LeagueHero],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  function srcDaCapa(host: HTMLElement): string | null {
    return host.querySelector('img')?.getAttribute('src') ?? null;
  }

  it('card de liga sem capa usa a arte do próprio esporte', () => {
    const f = TestBed.createComponent(LeagueCard);
    f.componentRef.setInput('league', liga());
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBe('/media/tournament-covers/volei_praia.webp');
  });

  it('a arte não substitui a capa que o organizador subiu', () => {
    const f = TestBed.createComponent(LeagueCard);
    f.componentRef.setInput('league', liga({ coverUrl: 'https://cdn.example.com/liga.jpg' }));
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBe('https://cdn.example.com/liga.jpg');
  });

  it('liga sem esporte reconhecido segue no gradiente', () => {
    const f = TestBed.createComponent(LeagueCard);
    f.componentRef.setInput('league', liga({ sport: null }));
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBeNull();
  });

  it('herói da liga sem capa usa a arte do próprio esporte', () => {
    const f = TestBed.createComponent(LeagueHero);
    f.componentRef.setInput('league', liga({ sport: 'footvolley' }));
    f.detectChanges();

    expect(srcDaCapa(f.nativeElement)).toBe('/media/tournament-covers/futevolei.webp');
  });
});
