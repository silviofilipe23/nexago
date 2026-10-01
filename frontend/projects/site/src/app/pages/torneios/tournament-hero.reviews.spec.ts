import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TournamentSummary } from '../../../lib/firestore/types';
import { TournamentHero } from './tournament-hero';

function torneio(): TournamentSummary {
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
    listingStatus: 'ended',
    featured: false,
    enrolledCount: 0,
    capacity: null,
    liveMatchesNow: 0,
    categoriesCount: 0,
    leagueId: null,
    leagueStageName: null,
    coverUrl: null,
  };
}

describe('herói do torneio — avaliação e organizador', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentHero],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('mostra o selo e a linha do organizador quando recebe os textos', () => {
    const f = TestBed.createComponent(TournamentHero);
    f.componentRef.setInput('t', torneio());
    f.componentRef.setInput('reviewBadge', '★ 4,6 · 23 avaliações');
    f.componentRef.setInput('organizerLine', 'Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('★ 4,6 · 23 avaliações');
    expect(text).toContain('Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
  });

  it('sem os textos (padrão) não mostra estrela nem organizador', () => {
    const f = TestBed.createComponent(TournamentHero);
    f.componentRef.setInput('t', torneio());
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent!;
    expect(text).not.toContain('★');
    expect(text).not.toContain('Organizado por');
  });
});
