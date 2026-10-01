import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PublicTournamentReviewsSource } from '../../data/public-tournament-reviews.source';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { TournamentLiveStore } from '../tournament-live.store';
import { OverviewTabComponent } from './overview-tab.component';

function resumo(over: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Etapa Areia',
    location: 'Arena Sul',
    city: 'Goiânia',
    dateLabel: '21/04',
    startAt: null,
    endAt: null,
    categories: [],
    format: 'Dupla',
    capacity: null,
    enrolledCount: 0,
    liveMatchesNow: 0,
    featured: false,
    rawStatus: 'completed',
    isCancelled: false,
    isDraftOrCancelled: false,
    leagueId: null,
    leagueStageId: null,
    leagueStageOrder: null,
    leagueStageName: null,
    coverUrl: null,
    managerId: null,
    regulationsText: null,
    sport: 'beachVolleyball',
    paymentMode: 'appPixCard',
    organizerPix: null,
    waitlistEnabled: true,
    requireFormedPair: false,
    registrationHoldMinutes: 30,
    registrationOpensAt: null,
    registrationClosesAt: null,
    tournamentPrizes: [],
    ...over,
  } as TournamentSummary;
}

describe('Visão geral — avaliação pública', () => {
  afterEach(() => TestBed.resetTestingModule());

  function mount(): { host: HTMLElement; store: TournamentLiveStore; fixture: ComponentFixture<OverviewTabComponent> } {
    TestBed.configureTestingModule({
      imports: [OverviewTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null) } },
        {
          provide: PublicTournamentReviewsSource,
          useValue: { watchSummary: () => () => undefined, watchReputation: () => () => undefined, fetchOrganizerName: () => Promise.resolve(null) },
        },
      ],
    });
    const store = TestBed.inject(TournamentLiveStore);
    store.tournament.set(resumo());
    const fixture = TestBed.createComponent(OverviewTabComponent);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, store, fixture };
  }

  it('com 3+ avaliações: selo no herói e seção na coluna lateral', () => {
    const { host, store, fixture } = mount();
    store.reviewSummary.set({ count: 23, average: 4.62, aspects: { organization: 4.8 } });
    fixture.detectChanges();
    const badges = [...host.querySelectorAll('.tdv-hero-badges span')].map((e) => e.textContent!.trim());
    expect(badges).toContain('★ 4,6 · 23 avaliações');
    expect(host.querySelector('app-tournament-review-aspects')?.textContent).toContain('Organização geral');
  });

  it('abaixo de 3 avaliações nada aparece', () => {
    const { host, store, fixture } = mount();
    store.reviewSummary.set({ count: 2, average: null, aspects: {} });
    fixture.detectChanges();
    expect(host.querySelector('.tdv-hero-badges')!.textContent).not.toContain('★');
    expect(host.querySelector('app-tournament-review-aspects section')).toBeNull();
  });
});
