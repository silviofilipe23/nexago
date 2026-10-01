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

  // Achado da revisão final: o herói tem altura fixa e o texto preso na base, então cada linha
  // nova cresce para cima. Num telefone baixo (herói na altura mínima de 26rem), título longo +
  // selo + linha do organizador empurravam os chips por cima do link "Todos os torneios".
  it('texto do herói não invade o link "Todos os torneios" num telefone baixo', async () => {
    const f = TestBed.createComponent(TournamentHero);
    const host = f.nativeElement as HTMLElement;
    host.style.width = '375px';
    f.componentRef.setInput('t', { ...torneio(), name: 'Copa Aurora de Beach Tennis — Etapa Goiânia Open de Verão' });
    f.componentRef.setInput('reviewBadge', '★ 4,6 · 23 avaliações');
    f.componentRef.setInput('organizerLine', 'Organizado por Arena Garden Eventos Esportivos de Goiânia · ★ 4,7 (86 avaliações em 5 torneios)');
    f.detectChanges();
    await f.whenStable();
    const link = host.querySelector('a[href="/torneios"]')!.getBoundingClientRect();
    const chips = host.querySelector('app-status-badge')!.parentElement!.getBoundingClientRect();
    expect(chips.top).toBeGreaterThanOrEqual(link.bottom);
  });
});
