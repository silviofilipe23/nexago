import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { TournamentReviewSummary } from '../data/tournament-reviews';
import type { OrganizerTournament } from '../data/tournament.model';
import { TorneioDetalheComponent } from './torneio-detalhe.component';

function tournament(): OrganizerTournament {
  return {
    id: 't1',
    name: 'Circuito Verão 2026',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'concluido',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [],
    capacity: null,
    waitlistEnabled: true,
    leagueId: null,
    courts: [],
    courtsCount: 0,
    matchOps: { dayStart: '08:00', dayEnd: '22:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30, dynamicRescheduleEnabled: false },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    sponsors: [],
    myRole: null,
  };
}

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Circuito Verão 2026',
    tournamentStartAt: null,
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: null,
    opensAt: null,
    closesAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    ...over,
  };
}

interface Internals {
  tournament: WritableSignal<OrganizerTournament | null>;
  reviewSummary: WritableSignal<TournamentReviewSummary | null>;
}

describe('TorneioDetalheComponent — avaliação dos atletas', () => {
  let fixture: ComponentFixture<TorneioDetalheComponent>;

  async function mount(s: TournamentReviewSummary | null): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [TorneioDetalheComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(TorneioDetalheComponent);
    // `id` vazio: nenhum `getTournament` nem listener de verdade. Semeia depois.
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.reviewSummary.set(s);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function reviewKpi(host: HTMLElement): HTMLAnchorElement | undefined {
    return [...host.querySelectorAll<HTMLAnchorElement>('a.og-torneio-kpi')].find(
      (a) => a.querySelector('.og-kpi-label')?.textContent?.trim() === 'Avaliação',
    );
  }

  it('com 3+ avaliações mostra a média e leva para a aba', async () => {
    const kpi = reviewKpi(await mount(summary()));
    expect(kpi?.querySelector('.og-kpi-value')?.textContent?.trim()).toBe('4,6 ★');
    expect(kpi?.getAttribute('href')).toContain('avaliacoes');
  });

  it('com menos de 3 avaliações mostra —', async () => {
    const kpi = reviewKpi(await mount(summary({ count: 2, average: null, distribution: null })));
    expect(kpi?.querySelector('.og-kpi-value')?.textContent?.trim()).toBe('—');
  });

  it('sem resumo também mostra —, e o atalho do telefone tem Avaliações', async () => {
    const host = await mount(null);
    expect(reviewKpi(host)?.querySelector('.og-kpi-value')?.textContent?.trim()).toBe('—');
    const tools = [...host.querySelectorAll('.og-torneio-tool span')].map((el) => el.textContent!.trim());
    expect(tools).toContain('Avaliações');
  });
});
