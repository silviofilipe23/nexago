import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ArenaBookingDoc } from '../data/arena-bookings-repository';
import type { BookingInvite } from '../data/booking-invite-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { BookingInvitePageComponent } from './booking-invite-page.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  invite: WritableSignal<BookingInvite | null>;
  booking: WritableSignal<ArenaBookingDoc | null>;
  bookingLoaded: WritableSignal<boolean>;
}

const firebase = environment.firebase as { apiKey: string };

function invite(overrides: Partial<BookingInvite> = {}): BookingInvite {
  return {
    id: 'b1_ana',
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
    inviteeUid: 'ana',
    inviteeName: 'Ana',
    inviteeAvatarUrl: null,
    createdAt: null,
    expiresAt: new Date('2099-10-24T23:30:00Z'),
    ...overrides,
  };
}

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
    amountToPayNowReais: 0,
    amountDueOnsiteReais: 120,
    amountPaidOnlineReais: 0,
    paymentChannel: 'onsite',
    paymentStatus: 'none',
    paymentFraction: null,
    status: 'active',
    paymentExpiresAt: null,
    slotCount: 1,
    ownerAthleteId: 'dono',
    confirmedParticipants: 1,
    guestAthleteId: null,
    guestAthleteName: null,
    participants: [],
    participantUids: [],
    recurringBookingId: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: 0,
    asaasPaymentId: null,
    cashbackAppliedReais: 0,
    ...overrides,
  };
}

describe('BookingInvitePageComponent', () => {
  // Sem chave de Firebase o componente não abre listener — convite e reserva são semeados à mão.
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  function render(inv: BookingInvite | null, b: ArenaBookingDoc | null, viewer = 'ana'): ComponentFixture<BookingInvitePageComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: viewer, displayName: 'Ana' }) } },
      ],
    }).overrideComponent(BookingInvitePageComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(BookingInvitePageComponent);
    const internals = fixture.componentInstance as unknown as Internals;
    fixture.componentRef.setInput('inviteId', inv?.id ?? 'nao-existe');
    fixture.detectChanges();
    // Ordem que funciona com os efeitos de carga: semear o convite, deixar o efeito da reserva
    // rodar, e só então semear a reserva.
    internals.invite.set(inv);
    fixture.detectChanges();
    internals.booking.set(b);
    internals.bookingLoaded.set(true);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<BookingInvitePageComponent>, selector: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function buttons(fixture: ComponentFixture<BookingInvitePageComponent>): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.cv-actions .cv-btn')).map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  it('convite direto: aceitar ou recusar, com os dados do jogo', () => {
    const fixture = render(invite(), booking({ participantUids: ['caio'], confirmedParticipants: 2 }));
    expect(text(fixture, '.cv-title')).toBe('Você foi convidado!');
    expect(text(fixture, '.cv-subtitle')).toBe('Bruno quer jogar com você.');
    expect(text(fixture, '.cv-info')).toContain('sábado, 24/10 às 19:00');
    expect(text(fixture, '.cv-info')).toContain('19:00 – 20:30');
    expect(text(fixture, '.cv-info')).toContain('2/4 jogadores confirmados');
    expect(buttons(fixture)).toEqual(['Quero jogar!', 'Não vou poder']);
  });

  it('link do WhatsApp: só aceita — "Agora não" não grava nada', () => {
    const link = invite({ id: 'link_b1', kind: 'link', status: 'open', inviteeUid: null });
    const fixture = render(link, booking());
    expect(buttons(fixture)).toEqual(['Quero jogar!', 'Agora não']);
  });

  it('dono abrindo o próprio link vai para a reserva', () => {
    const link = invite({ id: 'link_b1', kind: 'link', status: 'open', inviteeUid: null });
    const fixture = render(link, booking(), 'dono');
    expect(text(fixture, '.cv-title')).toBe('Este jogo é seu');
    const cta = (fixture.nativeElement as HTMLElement).querySelector('.cv-actions a');
    expect(cta?.getAttribute('href')).toBe('/agenda/reserva/b1');
  });

  it('quem já está no jogo vê "Você está no jogo!"', () => {
    const fixture = render(invite({ status: 'accepted' }), booking({ participantUids: ['ana'] }));
    expect(text(fixture, '.cv-title')).toBe('Você está no jogo!');
    expect(buttons(fixture)).toEqual(['Ver o jogo']);
  });

  it('quadra lotada, reserva cancelada e convite de outro atleta bloqueiam com o motivo', () => {
    expect(text(render(invite(), booking({ participantUids: ['x', 'y', 'z'] })), '.cv-subtitle')).toBe(
      'A quadra já está completa.',
    );
    TestBed.resetTestingModule();
    expect(text(render(invite(), booking({ status: 'canceled' })), '.cv-subtitle')).toBe('Esta reserva foi cancelada.');
    TestBed.resetTestingModule();
    expect(text(render(invite(), booking(), 'carla'), '.cv-subtitle')).toBe('Este convite é para outro atleta.');
  });

  it('reserva apagada conta como cancelada', () => {
    expect(text(render(invite(), null), '.cv-subtitle')).toBe('Esta reserva foi cancelada.');
  });

  it('convite que não existe', () => {
    const fixture = render(null, null);
    expect(text(fixture, '.cv-title')).toBe('Convite não encontrado');
  });
});
