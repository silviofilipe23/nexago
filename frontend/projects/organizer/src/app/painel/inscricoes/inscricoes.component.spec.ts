import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AthleteContact, TwinRegistrationPair } from '../data/athlete-contacts-repository';
import { EMPTY_INSCRIPTION_UNIFORM, type TournamentInscription } from '../data/inscriptions-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament } from '../data/tournament.model';
import { InscricoesComponent, contactsRefreshDelay } from './inscricoes.component';

const COALESCE = 10_000;

function inscription(over: Partial<TournamentInscription> = {}): TournamentInscription {
  return {
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'femB',
    teamId: 'team-1',
    teamName: 'Ana / Bia',
    customTeamName: null,
    participants: [
      { uid: 'u1', name: 'Ana', photoUrl: null, levelsBySport: {}, legacyLevel: null },
      { uid: 'u2', name: 'Bia', photoUrl: null, levelsBySport: {}, legacyLevel: null },
    ],
    participantNames: ['Ana', 'Bia'],
    paymentStatus: 'pending',
    paid: false,
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
    createdAt: new Date('2026-08-20T10:00:00Z'),
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
    status: 'inscricoes',
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
    matchOps: {
      dayStart: '08:00',
      dayEnd: '22:00',
      defaultMatchDurationMin: 30,
      minRestBetweenMatchesMin: 30,
      dynamicRescheduleEnabled: false,
    },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    sponsors: [],
    myRole: null,
  };
}

/** Estado interno alimentado na mão: com `id` vazio o efeito de boot devolve na primeira linha,
 *  então nenhum listener é aberto e a tela fica só com o que este spec puser. */
interface Internals {
  tournament: WritableSignal<OrganizerTournament | null>;
  inscriptions: WritableSignal<TournamentInscription[]>;
  contacts: WritableSignal<ReadonlyMap<string, AthleteContact>>;
  twinPairs: WritableSignal<readonly TwinRegistrationPair[]>;
  occupancyByCategory: () => Record<string, number>;
  waitlistEnabled: () => boolean;
}

describe('contactsRefreshDelay', () => {
  it('busca na hora a primeira vez, com a lista recém-chegada', () => {
    expect(contactsRefreshDelay(['u1', 'u2'], new Set(), COALESCE)).toBe(0);
  });

  it('não busca nada quando todo mundo da lista já foi perguntado', () => {
    expect(contactsRefreshDelay(['u1'], new Set(['u1', 'u2']), COALESCE)).toBeNull();
  });

  it('não busca nada em torneio sem inscrição', () => {
    expect(contactsRefreshDelay([], new Set(), COALESCE)).toBeNull();
  });

  // O caso que a lista viva cria: a rajada de inscrições que entra junta tem de virar UMA
  // invocação de Cloud Function, não uma por inscrição.
  it('adia a busca do atleta novo pra juntar a rajada numa chamada só', () => {
    expect(contactsRefreshDelay(['u1', 'u3'], new Set(['u1', 'u2']), COALESCE)).toBe(COALESCE);
  });
});

describe('InscricoesComponent — lista remontada por peça que chega', () => {
  async function mount() {
    await TestBed.configureTestingModule({
      imports: [InscricoesComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(InscricoesComponent);
    fixture.componentRef.setInput('id', '');
    fixture.componentRef.setInput('registrationId', '');
    // Efeito de boot roda no primeiro ciclo e zera tudo — semear só depois dele.
    fixture.detectChanges();
    return fixture;
  }

  it('mostra a inscrição que chegou antes do torneio, com a categoria ainda em “—”', async () => {
    const fixture = await mount();
    const internals = fixture.componentInstance as unknown as Internals;

    internals.inscriptions.set([inscription()]);
    fixture.detectChanges();

    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).toContain('Ana / Bia');
    expect(html).toContain('—');
  });

  // O torneio é outra ida à rede: quando ele chega, o cabeçalho e a categoria têm de se
  // atualizar sozinhos, sem recarregar as inscrições.
  it('completa o cabeçalho quando o torneio chega depois', async () => {
    const fixture = await mount();
    const internals = fixture.componentInstance as unknown as Internals;

    internals.inscriptions.set([inscription(), inscription({ id: 'i2' })]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Circuito Verão 2026');

    internals.tournament.set(tournament());
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Circuito Verão 2026 · 2 inscrições');
  });

  // Os pares vêm do callable dos contatos, que chega depois da lista: o selo aparece nas duas
  // inscrições sem nova ida ao listener.
  it('põe o selo de possível duplicado nas duas inscrições quando os pares chegam', async () => {
    const fixture = await mount();
    const internals = fixture.componentInstance as unknown as Internals;
    const flagged = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.og-insc-row')]
        .filter((r) => r.textContent?.includes('Possível duplicado'))
        .map((r) => r.querySelector('.og-insc-name')?.textContent?.trim());

    internals.inscriptions.set([
      inscription(),
      inscription({
        id: 'i2',
        teamName: 'Aninha / Carla',
        participants: [
          { uid: 'u3', name: 'Aninha', photoUrl: null, levelsBySport: {}, legacyLevel: null },
          { uid: 'u4', name: 'Carla', photoUrl: null, levelsBySport: {}, legacyLevel: null },
        ],
      }),
      inscription({ id: 'i3', teamName: 'Duda / Eva' }),
    ]);
    fixture.detectChanges();
    expect(flagged()).toEqual([]);

    internals.twinPairs.set([{ categoryId: 'femB', registrationIds: ['i1', 'i2'], uids: ['u1', 'u3'] }]);
    fixture.detectChanges();
    expect(flagged().sort()).toEqual(['Ana / Bia', 'Aninha / Carla']);
  });

  /** A ocupação alimenta o aviso de "categoria lotada" do formulário. Ela tem de contar do
   *  mesmo jeito que o servidor conta, senão a tela oferece vaga extra onde ainda cabe alguém
   *  (ou esconde a oferta justamente onde ela é a única saída). */
  describe('ocupação por categoria', () => {
    it('conta 1 por inscrição e ignora a fila de espera', async () => {
      const fixture = await mount();
      const internals = fixture.componentInstance as unknown as Internals;

      internals.tournament.set(tournament());
      internals.inscriptions.set([
        inscription({ id: 'i1' }),
        inscription({ id: 'i2' }),
        inscription({ id: 'i3', categoryId: 'mascA' }),
        inscription({ id: 'i4', paymentStatus: 'waitlist' }),
      ]);
      fixture.detectChanges();

      expect(internals.occupancyByCategory()).toEqual({ femB: 2, mascA: 1 });
    });

    it('torneio sem o campo `waitlistEnabled` conta como fila ligada', async () => {
      const fixture = await mount();
      const internals = fixture.componentInstance as unknown as Internals;

      expect(internals.waitlistEnabled()).toBeTrue();
      internals.tournament.set({ ...tournament(), waitlistEnabled: false });
      fixture.detectChanges();
      expect(internals.waitlistEnabled()).toBeFalse();
    });
  });
});
