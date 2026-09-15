import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import type { TournamentSummary } from '../data/tournaments-repository';
import type { AthleteTournamentRegistration } from '../data/tournament-registrations-repository';
import { NxToastService } from '../shared/feedback/nx-toast.service';
import { OverviewTabComponent } from './tabs/overview-tab.component';
import { RegistrationTabComponent } from './tabs/registration-tab.component';
import { discoveryTournamentFromSummary } from './tournament-discovery.component';
import { TournamentLiveStore } from './tournament-live.store';

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
    rawStatus: 'open',
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

describe('capa padrão do torneio — listagem do atleta', () => {
  it('torneio sem capa entra na listagem com a arte do esporte', () => {
    const t = discoveryTournamentFromSummary(resumo(), new Set(), null);

    expect(t.coverUrl).toBe('/media/tournament-covers/volei_praia.webp');
  });

  it('a arte não substitui a capa que o organizador subiu', () => {
    const t = discoveryTournamentFromSummary(
      resumo({ coverUrl: 'https://cdn.example.com/capa.jpg' }),
      new Set(),
      null,
    );

    expect(t.coverUrl).toBe('https://cdn.example.com/capa.jpg');
  });

  it('torneio sem esporte reconhecido segue no gradiente', () => {
    const t = discoveryTournamentFromSummary(resumo({ sport: null }), new Set(), null);

    expect(t.coverUrl).toBeNull();
  });
});

describe('capa padrão do torneio — aba Visão geral', () => {
  function heroCoverDe(t: TournamentSummary | null): string | null {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OverviewTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    });

    const store = TestBed.inject(TournamentLiveStore);
    store.tournament.set(t);

    const fixture = TestBed.createComponent(OverviewTabComponent);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('img')?.getAttribute('src') ?? null;
  }

  it('sem capa, o herói da aba usa a arte do esporte', () => {
    expect(heroCoverDe(resumo({ sport: 'footvolley' }))).toBe(
      '/media/tournament-covers/futevolei.webp',
    );
  });

  it('torneio sem esporte reconhecido segue só no gradiente', () => {
    expect(heroCoverDe(resumo({ sport: null }))).toBeNull();
  });
});

describe('capa padrão do torneio — card da minha inscrição', () => {
  function inscricao(): AthleteTournamentRegistration {
    return {
      id: 'r1',
      tournamentId: 't1',
      categoryId: 'c1',
      teamId: 'team1',
      partnerPending: false,
      isPaid: false,
      waitlist: false,
      cancellationRequest: null,
      sharePaidUids: [],
      declaredPaidAt: null,
      paymentVerifiedByOrganizer: false,
      player1Id: 'eu',
      participantUids: ['eu', 'bia'],
      lgpdAcceptedUids: [],
      uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
      uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
      teamName: null,
      teamSize: null,
      captainUid: null,
      uniformByUid: {},
      substitutionHistory: [],
      holdExpiresAt: null,
    };
  }

  function capaDoCard(t: TournamentSummary): string | null {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RegistrationTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TournamentLiveStore,
        NxToastService,
        { provide: AuthService, useValue: { user: signal({ uid: 'eu' }) } },
      ],
    });

    const store = TestBed.inject(TournamentLiveStore);
    store.tournament.set(t);

    const fixture = TestBed.createComponent(RegistrationTabComponent);
    // O store zera `myRegistrations` no efeito que reage ao usuário: alimentar
    // antes da primeira detecção seria apagado.
    fixture.detectChanges();
    store.myRegistrations.set([inscricao()]);
    fixture.detectChanges();

    return (
      fixture.nativeElement.querySelector('.reg-tournament-cover')?.getAttribute('src') ?? null
    );
  }

  it('inscrição em torneio sem capa mostra a arte do esporte', () => {
    expect(capaDoCard(resumo({ sport: 'beachTennis' }))).toBe(
      '/media/tournament-covers/beach_tennis.webp',
    );
  });

  it('torneio sem esporte reconhecido segue sem capa no card', () => {
    expect(capaDoCard(resumo({ sport: null }))).toBeNull();
  });
});
