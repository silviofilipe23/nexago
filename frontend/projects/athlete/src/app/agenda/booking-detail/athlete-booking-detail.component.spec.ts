import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { ArenaBookingDoc } from '../../data/arena-bookings-repository';
import type { BookingInvite } from '../../data/booking-invite-model';
import { PendingArenaReviewService } from '../../data/pending-arena-review.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { LocationMapComponent } from '../../shared/location-map/location-map.component';
import { AthleteBookingDetailComponent } from './athlete-booking-detail.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

@Component({ selector: 'app-location-map', template: '' })
class LocationMapStubComponent {
  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly label = input('arena');
  readonly googleMapsApiKey = input('');
}

interface Internals {
  booking: WritableSignal<ArenaBookingDoc | null>;
  error: WritableSignal<string | null>;
  loading: WritableSignal<boolean>;
  invites: WritableSignal<BookingInvite[]>;
  ownerProfile: WritableSignal<{ name: string; avatarUrl: string | null } | null>;
}

const firebase = environment.firebase as { apiKey: string };

function booking(overrides: Partial<ArenaBookingDoc> = {}): ArenaBookingDoc {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    courtId: 'c2',
    courtName: 'Quadra 2',
    sport: null,
    dateKey: '2099-10-24',
    startTime: '19:00',
    endTime: '20:30',
    amountReais: 120,
    amountToPayNowReais: 60,
    amountDueOnsiteReais: 60,
    amountPaidOnlineReais: 60,
    paymentChannel: 'pix',
    paymentStatus: 'partial',
    paymentFraction: 0.5,
    status: 'confirmed',
    paymentExpiresAt: null,
    slotCount: 1,
    ownerAthleteId: 'dono',
    confirmedParticipants: 2,
    guestAthleteId: null,
    guestAthleteName: null,
    participants: [{ uid: 'ana', name: 'Ana Souza', avatarUrl: null, via: 'link' }],
    participantUids: ['ana'],
    recurringBookingId: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: 0,
    asaasPaymentId: null,
    cashbackAppliedReais: 0,
    ...overrides,
  };
}

const pendingCaio: BookingInvite = {
  id: 'b1_caio',
  bookingId: 'b1',
  arenaId: 'a1',
  arenaName: 'Arena Sol',
  courtName: 'Quadra 2',
  date: '2099-10-24',
  startTime: '19:00',
  endTime: '20:30',
  invitedByUid: 'dono',
  invitedByName: 'Bruno',
  status: 'pending',
  kind: 'direct',
  inviteeUid: 'caio',
  inviteeName: 'Caio Reis',
  inviteeAvatarUrl: null,
  createdAt: null,
  expiresAt: null,
};

describe('AthleteBookingDetailComponent — equipe e convites', () => {
  // Sem chave de Firebase a tela não lê nada: a reserva é semeada à mão depois do 1º ciclo.
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  function render(viewer: string, b: ArenaBookingDoc, seed: (i: Internals) => void = () => {}) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: viewer, displayName: 'Bruno Lima' }), devEmail: signal(null) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ bookingId: b.id }) } } },
        {
          provide: PendingArenaReviewService,
          useValue: { isReviewed: () => false, refresh: async () => {}, markReviewed: () => {} },
        },
      ],
    }).overrideComponent(AthleteBookingDetailComponent, {
      remove: { imports: [AtPanelShellComponent, LocationMapComponent] },
      add: { imports: [PanelShellStubComponent, LocationMapStubComponent] },
    });
    const fixture = TestBed.createComponent(AthleteBookingDetailComponent);
    const internals = fixture.componentInstance as unknown as Internals;
    fixture.detectChanges();
    internals.error.set(null);
    internals.loading.set(false);
    internals.booking.set(b);
    seed(internals);
    fixture.detectChanges();
    return fixture;
  }

  const host = (f: ComponentFixture<AthleteBookingDetailComponent>) => f.nativeElement as HTMLElement;
  const texts = (f: ComponentFixture<AthleteBookingDetailComponent>, sel: string) =>
    Array.from(host(f).querySelectorAll(sel)).map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const pageText = (f: ComponentFixture<AthleteBookingDetailComponent>) => host(f).textContent?.replace(/\s+/g, ' ') ?? '';

  it('dono: "Sua equipe", tira quem entrou, cancela convite pendente e convida', () => {
    const fixture = render('dono', booking(), (i) => i.invites.set([pendingCaio]));
    expect(texts(fixture, '.bd-card-title')).toContain('Sua equipe');
    expect(texts(fixture, '.bd-team-list .bd-team-name')).toEqual(['Você', 'Ana Souza', 'Vaga aberta', 'Vaga aberta']);
    expect(texts(fixture, '.bd-team-list .bd-link-danger')).toEqual(['Tirar']);
    expect(texts(fixture, '.bd-pending .bd-team-name')).toEqual(['Caio Reis']);
    expect(texts(fixture, '.bd-pending button')).toEqual(['Cancelar']);
    expect(pageText(fixture)).toContain('Convidar jogadores');
    expect(texts(fixture, '.bd-card-kicker')).toContain('Pagamento');
  });

  it('convidado: vê o dono pelo nome, a si como "Você" e só pode sair do jogo', () => {
    const fixture = render('ana', booking(), (i) => {
      i.invites.set([pendingCaio]);
      i.ownerProfile.set({ name: 'Bruno Lima', avatarUrl: null });
    });
    expect(texts(fixture, '.bd-card-title')).toContain('Quem vai jogar');
    expect(texts(fixture, '.bd-team-list .bd-team-name')).toEqual(['Bruno Lima', 'Você', 'Vaga aberta', 'Vaga aberta']);
    expect(texts(fixture, '.bd-link-danger')).toEqual([]);
    expect(host(fixture).querySelector('.bd-pending')).toBeNull();
    expect(texts(fixture, '.bd-btn-leave')).toEqual(['Sair do jogo']);
    // Pagamento, rachar, cancelar e avaliar seguem do dono.
    expect(texts(fixture, '.bd-card-kicker')).not.toContain('Pagamento');
    expect(pageText(fixture)).not.toContain('Rachar pagamento');
    expect(pageText(fixture)).not.toContain('Cancelar reserva');
    expect(pageText(fixture)).not.toContain('Convidar jogadores');
    expect(texts(fixture, '.bd-status-badge')).toEqual(['CONFIRMADA']);
  });

  it('dono com reserva aguardando PIX não convida', () => {
    const fixture = render('dono', booking({ status: 'pending_payment', participants: [], participantUids: [] }));
    expect(pageText(fixture)).toContain('Conclua o pagamento da reserva para convidar jogadores.');
    expect(texts(fixture, '.bd-team-row--empty button')).toEqual([]);
  });

  it('quadra completa: sem "Convidar" nas vagas', () => {
    const full = booking({
      participants: ['ana', 'caio', 'duda'].map((uid) => ({ uid, name: uid, avatarUrl: null, via: 'direct' as const })),
      participantUids: ['ana', 'caio', 'duda'],
      confirmedParticipants: 4,
    });
    const fixture = render('dono', full);
    expect(host(fixture).querySelector('.bd-team-row--empty')).toBeNull();
    expect(pageText(fixture)).toContain('Quadra completa');
  });
});
