import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { routes } from '../app.routes';
import { authGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { onboardingGuard } from '../auth/onboarding.guard';
import {
  guestShareStatusLabel,
  type ArenaBookingPaymentShare,
  type ArenaBookingPaymentShareStatus,
} from '../data/arena-booking-split-repository';
import type { ArenaBookingDoc } from '../data/arena-bookings-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { BookingSharePaymentComponent } from './booking-share-payment.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  share: WritableSignal<ArenaBookingPaymentShare | null>;
  booking: WritableSignal<ArenaBookingDoc | null>;
  loadError: WritableSignal<string | null>;
}

const firebase = environment.firebase as { apiKey: string };

function share(status: ArenaBookingPaymentShareStatus, overrides: Partial<ArenaBookingPaymentShare> = {}): ArenaBookingPaymentShare {
  return {
    id: 's1',
    payerAthleteId: 'ana',
    amountReais: 35,
    status,
    pixCopyPaste: '00020126PIXs1',
    qrCodeBase64: null,
    expiresAt: new Date(2099, 9, 24, 17, 0),
    createdAt: null,
    ...overrides,
  };
}

function booking(): ArenaBookingDoc {
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
    amountReais: 140,
    amountToPayNowReais: 140,
    amountDueOnsiteReais: 0,
    amountPaidOnlineReais: 0,
    paymentChannel: 'pix',
    paymentStatus: 'split_pending',
    paymentFraction: 1,
    status: 'confirmed',
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
    allocationStatus: null,
  };
}

describe('BookingSharePaymentComponent', () => {
  // Sem chave de Firebase o componente não abre listener — fatia e reserva são semeadas à mão.
  let realApiKey = '';
  let toasts: jasmine.SpyObj<NxToastService>;
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  function render(s: ArenaBookingPaymentShare | null, b: ArenaBookingDoc | null = booking()): ComponentFixture<BookingSharePaymentComponent> {
    toasts = jasmine.createSpyObj<NxToastService>('NxToastService', ['success', 'error', 'info']);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'ana', displayName: 'Ana' }) } },
        { provide: NxToastService, useValue: toasts },
      ],
    }).overrideComponent(BookingSharePaymentComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(BookingSharePaymentComponent);
    fixture.componentRef.setInput('bookingId', 'b1');
    fixture.componentRef.setInput('shareId', 's1');
    fixture.detectChanges();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.share.set(s);
    internals.booking.set(b);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<BookingSharePaymentComponent>, selector: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function has(fixture: ComponentFixture<BookingSharePaymentComponent>, selector: string): boolean {
    return (fixture.nativeElement as HTMLElement).querySelector(selector) != null;
  }

  it('rota do push existe e exige login e onboarding', () => {
    const route = routes.find((r) => r.path === 'reservas/:bookingId/parcela/:shareId');
    expect(route).toBeDefined();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(onboardingGuard);
  });

  it('pendente: valor, resumo da reserva, prazo e copia e cola', () => {
    const fixture = render(share('pending'));
    expect(text(fixture, '.cv-title')).toBe('Sua parte: R$ 35,00');
    expect(text(fixture, '.sp-status')).toBe('Aguardando');
    expect(text(fixture, '.cv-headline')).toBe('Arena Sol');
    expect(text(fixture, '.cv-caption')).toBe('Quadra 2');
    expect(text(fixture, '.cv-info')).toContain('24/10 às 19:00');
    expect(text(fixture, '.cv-info')).toContain('19:00 – 20:30');
    expect(text(fixture, '.sp-deadline')).toContain('Pague até 24/10 às 17:00');
    expect(text(fixture, '.sp-code')).toBe('00020126PIXs1');
  });

  it('vira "Pago" ao vivo e esconde o Pix', () => {
    const fixture = render(share('pending'));
    expect(has(fixture, '.sp-code-row')).toBeTrue();

    (fixture.componentInstance as unknown as Internals).share.set(share('paid'));
    fixture.detectChanges();

    expect(text(fixture, '.sp-status')).toBe('Pago');
    expect(text(fixture, '.sp-note')).toBe('Pagamento confirmado. Bom jogo!');
    expect(has(fixture, '.sp-code-row')).toBeFalse();
  });

  it('prazo vencido: virou conta de quem reservou, sem Pix', () => {
    const fixture = render(share('covered_by_organizer'));
    expect(text(fixture, '.sp-status')).toBe('Virou conta de quem reservou');
    expect(text(fixture, '.sp-note')).toContain('Acerte a sua parte direto');
    expect(has(fixture, '.sp-code-row')).toBeFalse();
  });

  it('expirada: avisa e não mostra o Pix', () => {
    const fixture = render(share('expired'));
    expect(text(fixture, '.sp-status')).toBe('Expirado');
    expect(has(fixture, '.sp-code-row')).toBeFalse();
  });

  it('copia o código Pix', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    const fixture = render(share('pending'));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.sp-copy-btn')!.click();
    await fixture.whenStable();
    expect(write).toHaveBeenCalledWith('00020126PIXs1');
    expect(toasts.success).toHaveBeenCalled();
  });

  it('fatia que não existe: "Cobrança não encontrada"', () => {
    const fixture = render(null, null);
    expect(text(fixture, '.cv-title')).toBe('Cobrança não encontrada');
  });

  it('erro de leitura mostra mensagem amigável', () => {
    const fixture = render(null, null);
    (fixture.componentInstance as unknown as Internals).loadError.set('Não foi possível abrir a sua parte da reserva.');
    fixture.detectChanges();
    expect(text(fixture, '.cv-title')).toBe('Não foi possível abrir a cobrança');
    expect(text(fixture, '.cv-subtitle')).toBe('Não foi possível abrir a sua parte da reserva.');
  });

  it('rótulos do convidado', () => {
    expect(guestShareStatusLabel('pending')).toBe('Aguardando');
    expect(guestShareStatusLabel('paid')).toBe('Pago');
    expect(guestShareStatusLabel('expired')).toBe('Expirado');
    expect(guestShareStatusLabel('covered_by_organizer')).toBe('Virou conta de quem reservou');
  });
});
