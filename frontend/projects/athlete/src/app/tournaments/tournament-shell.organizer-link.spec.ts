import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { PartnerInvitesService } from '../data/partner-invites.service';
import { PublicTournamentReviewsSource } from '../data/public-tournament-reviews.source';
import { StaffTournamentsService } from '../data/staff-tournaments.service';
import type { TournamentSummary } from '../data/tournaments-repository';
import { TournamentLiveStore } from './tournament-live.store';
import { TournamentShellComponent } from './tournament-shell.component';

@Component({ template: '' })
class EmptyTabComponent {}

function torneio(managerId: string | null): TournamentSummary {
  return {
    id: 't1',
    name: 'Copa Verão',
    city: 'Goiânia',
    location: 'Arena Sul',
    locationAddress: null,
    dateLabel: null,
    startAt: null,
    endAt: null,
    format: 'Dupla',
    capacity: 0,
    enrolledCount: 0,
    featured: false,
    liveMatchesNow: 0,
    rawStatus: 'open',
    isCancelled: false,
    isDraftOrCancelled: false,
    leagueId: null,
    leagueStageId: null,
    leagueStageOrder: null,
    leagueStageName: null,
    coverUrl: null,
    managerId,
    regulationsText: null,
    sport: 'beachVolleyball',
    paymentMode: 'appPixCard',
    organizerPix: null,
    waitlistEnabled: true,
    requireFormedPair: false,
    enrolledTeamsVisible: true,
    registrationHoldMinutes: 30,
    registrationOpensAt: null,
    registrationClosesAt: null,
    tournamentPrizes: [],
    categories: [],
  };
}

/** "Organizado por X" virou link para o perfil público do organizador (spec 2026-10-02). */
describe('TournamentShellComponent — linha "Organizado por"', () => {
  let fixture: ComponentFixture<TournamentShellComponent>;
  let apiKey: string | undefined;
  let reputation: { reviewsCount: number; tournamentsRated: number; average: number } | null;
  let hasPublicProfile: boolean;

  beforeEach(() => {
    reputation = null;
    hasPublicProfile = true;
    apiKey = environment.firebase.apiKey;
    (environment.firebase as { apiKey?: string }).apiKey = '';
    TestBed.configureTestingModule({
      imports: [TournamentShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: EmptyTabComponent }]),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null), devEmail: signal(null) } },
        {
          provide: PublicTournamentReviewsSource,
          useValue: {
            watchSummary: () => () => undefined,
            watchReputation: (_id: string, cb: (r: typeof reputation) => void) => {
              cb(reputation);
              return () => undefined;
            },
            fetchOrganizerName: () => Promise.resolve({ name: 'Liga Amadora', hasPublicProfile }),
          },
        },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => undefined } },
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
      ],
    });
  });

  afterEach(() => {
    (environment.firebase as { apiKey?: string }).apiKey = apiKey;
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  /** O nome e a nota chegam pelo effect do store (fonte falsa), como na tela de verdade. */
  async function render(managerId: string | null, rating: boolean): Promise<HTMLElement> {
    reputation = rating ? { reviewsCount: 86, tournamentsRated: 5, average: 4.71 } : null;
    const store = TestBed.inject(TournamentLiveStore);
    fixture = TestBed.createComponent(TournamentShellComponent);
    store.tournament.set(torneio(managerId));
    store.loading.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('o nome leva a /organizadores/{managerId} e a nota fica ao lado', async () => {
    const host = await render('org-1', true);
    const link = host.querySelector<HTMLAnchorElement>('.tsh-organizer a');
    expect(link?.textContent?.trim()).toBe('Liga Amadora');
    expect(link?.getAttribute('href')).toBe('/organizadores/org-1');
    expect(host.querySelector('.tsh-organizer')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Organizado por Liga Amadora · ★ 4,7 (86 avaliações em 5 torneios)',
    );
  });

  it('sem nota: só o nome com link', async () => {
    const host = await render('org-1', false);
    expect(host.querySelector('.tsh-organizer')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Organizado por Liga Amadora');
    expect(host.querySelector('.tsh-organizer a')).not.toBeNull();
  });

  it('sem página pública (nome veio de public_profiles): nome sem link, para não levar a "não encontrado"', async () => {
    hasPublicProfile = false;
    const host = await render('org-1', true);
    expect(host.querySelector('.tsh-organizer a')).toBeNull();
    expect(host.querySelector('.tsh-organizer')?.textContent?.replace(/\s+/g, ' ')).toContain('Organizado por Liga Amadora');
  });
});
