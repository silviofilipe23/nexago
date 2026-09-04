import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY_INSCRIPTION_UNIFORM, type InscriptionParticipant, type TournamentInscription } from '../data/inscriptions-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament } from '../data/tournament.model';
import { PersonPhotoService } from '../ui/person-photo.service';
import { SeedsComponent } from './seeds.component';

function participant(over: Partial<InscriptionParticipant> = {}): InscriptionParticipant {
  return {
    uid: 'a1',
    name: 'Ana Paula',
    photoUrl: null,
    levelsBySport: { BEACH_TENNIS: 'intermediario_1' },
    legacyLevel: null,
    ...over,
  };
}

function inscription(over: Partial<TournamentInscription> = {}): TournamentInscription {
  return {
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'femB',
    teamId: 'team-1',
    teamName: 'Ana Paula / Beatriz Costa',
    customTeamName: null,
    participants: [],
    participantNames: [],
    paymentStatus: 'paid',
    paid: true,
    paidByOrganizer: false,
    needsVerification: false,
    sharePaidCount: 0,
    sharePaidUids: [],
    organizerConfirmedShareUids: [],
    partnerPending: false,
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_INSCRIPTION_UNIFORM,
    uniformPlayer2: EMPTY_INSCRIPTION_UNIFORM,
    uniformByUid: {},
    teamSize: null,
    captainUid: null,
    cancellationRequest: null,
    createdAt: null,
    ...over,
  };
}

function tournament(): OrganizerTournament {
  return {
    id: 't1',
    name: 'Circuito Verão 2026',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [
      {
        id: 'femB',
        name: 'Feminino B',
        maxTeams: null,
        entryFee: 0,
        teamSize: null,
        bracketFormat: null,
        teamsPerGroup: 3,
        qualifiersPerGroup: 2,
        bestOf: null,
        uniformType: null,
        uniformNumberOnShirt: false,
        uniformNameOnShirt: false,
        uniformSizeOptionsTop: [],
        uniformSizeOptionsShorts: [],
      },
    ],
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
  };
}

/** Estado interno alimentado na mão: com `id` vazio o efeito de carga devolve na primeira linha
 *  (`if (!tid || !cid) return`), então nada de Firestore entra em cena. Mesmo seam do spec de
 *  `categoria-detalhe`. */
interface Internals {
  tournament: WritableSignal<OrganizerTournament | null>;
  eligible: WritableSignal<TournamentInscription[]>;
  loading: WritableSignal<boolean>;
  redraw(): void;
}

describe('SeedsComponent — avatares dos atletas', () => {
  let fixture: ComponentFixture<SeedsComponent>;

  async function mount(eligible: TournamentInscription[]): Promise<HTMLElement> {
    // Portal zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste não
    // carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [SeedsComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SeedsComponent);
    fixture.componentRef.setInput('catId', 'femB');
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.eligible.set(eligible);
    internals.loading.set(false);
    internals.redraw();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function seedRowAvatars(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll('.og-seed-row .og-seed-avatars .og-avatar'));
  }

  it('mostra um rosto por atleta da dupla, com a foto de cada um', async () => {
    const el = await mount([
      inscription({
        participants: [
          participant({ uid: 'a1', name: 'Ana Paula', photoUrl: 'https://cdn/ana.jpg' }),
          participant({ uid: 'a2', name: 'Beatriz Costa', photoUrl: 'https://cdn/bia.jpg' }),
        ],
      }),
    ]);

    const avatars = seedRowAvatars(el);
    expect(avatars.length).toBe(2);
    expect(avatars.map((a) => a.querySelector('img')?.getAttribute('src'))).toEqual(['https://cdn/ana.jpg', 'https://cdn/bia.jpg']);
  });

  it('atleta com foto vira botão de ampliar e abre o visualizador com nome, papel e contexto', async () => {
    const el = await mount([
      inscription({
        participants: [
          participant({ uid: 'a1', name: 'Ana Paula', photoUrl: 'https://cdn/ana.jpg' }),
          participant({ uid: 'a2', name: 'Beatriz Costa', photoUrl: 'https://cdn/bia.jpg' }),
        ],
      }),
    ]);

    const second = seedRowAvatars(el)[1]!;
    expect(second.getAttribute('role')).toBe('button');
    expect(second.getAttribute('aria-label')).toBe('Ver foto de Beatriz Costa');

    second.click();
    await fixture.whenStable();

    const photo = TestBed.inject(PersonPhotoService).photo();
    expect(photo?.photoUrl).toBe('https://cdn/bia.jpg');
    expect(photo?.name).toBe('Beatriz Costa');
    expect(photo?.role).toBe('Atleta');
    expect(photo?.meta).toBe('Feminino B · Ana Paula / Beatriz Costa');
  });

  /** Sem foto não há o que ampliar — o avatar segue só com as iniciais, sem afordância falsa. */
  it('atleta sem foto continua nas iniciais e não vira botão', async () => {
    const el = await mount([
      inscription({
        participants: [participant({ uid: 'a1', name: 'Ana Paula', photoUrl: null }), participant({ uid: 'a2', name: 'Beatriz Costa', photoUrl: null })],
      }),
    ]);

    const avatars = seedRowAvatars(el);
    expect(avatars.map((a) => a.textContent?.trim())).toEqual(['AP', 'BC']);
    expect(avatars.some((a) => a.getAttribute('role') === 'button')).toBe(false);
  });

  /** Inscrição cujo elenco ainda não resolveu perfil (reserva solo, parceiro pendente) cai no
   *  rótulo da equipe — as iniciais quebram por " / ", não por espaço, senão "Iris Lopes /
   *  Joana Vieira" viraria "IL" em vez de "IJ". */
  it('inscrição sem elenco resolvido cai num avatar só, com as iniciais da dupla', async () => {
    const el = await mount([inscription({ teamName: 'Iris Lopes / Joana Vieira', participants: [] })]);

    const avatars = seedRowAvatars(el);
    expect(avatars.length).toBe(1);
    expect(avatars[0]!.textContent?.trim()).toBe('IJ');
  });

  it('prévia de grupos também mostra os rostos, ampliáveis', async () => {
    const el = await mount([
      inscription({
        id: 'i1',
        teamId: 'team-1',
        participants: [participant({ uid: 'a1', name: 'Ana Paula', photoUrl: 'https://cdn/ana.jpg' })],
      }),
    ]);

    const groupAvatars = el.querySelectorAll('.og-seeds-group-team .og-seed-avatars .og-avatar');
    expect(groupAvatars.length).toBe(1);
    expect(groupAvatars[0]!.getAttribute('aria-label')).toBe('Ver foto de Ana Paula');
  });
});
