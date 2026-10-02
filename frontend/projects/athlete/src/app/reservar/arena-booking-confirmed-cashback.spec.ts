import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ArenaBookingDoc } from '../data/arena-bookings-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ArenaBookingConfirmedComponent } from './arena-booking-confirmed.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  booking: WritableSignal<ArenaBookingDoc | null>;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o `load()` para no primeiro `if` — a reserva é semeada à mão. */
function useBlankFirebaseKey(): void {
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });
}

function booking(overrides: Partial<ArenaBookingDoc> = {}): ArenaBookingDoc {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    courtId: 'c1',
    courtName: 'Quadra 1',
    dateKey: '2026-10-12',
    startTime: '19:00',
    endTime: '20:00',
    amountReais: 120,
    amountToPayNowReais: 120,
    amountDueOnsiteReais: 0,
    amountPaidOnlineReais: 120,
    paymentChannel: 'pix',
    paymentStatus: 'paid',
    paymentFraction: 1,
    status: 'confirmed',
    paymentExpiresAt: null,
    slotCount: 1,
    ownerAthleteId: 'me',
    confirmedParticipants: 1,
    guestAthleteId: null,
    guestAthleteName: null,
    recurringBookingId: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: 0,
    asaasPaymentId: 'pay_1',
    cashbackAppliedReais: 0,
    ...overrides,
  };
}

async function create(
  fake: FakeCashbackService,
  doc: ArenaBookingDoc,
): Promise<ComponentFixture<ArenaBookingConfirmedComponent>> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
      { provide: CashbackService, useValue: fake.asService() },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ arenaId: 'a1' }),
            queryParamMap: convertToParamMap({ bookingId: 'b1' }),
          },
        },
      },
    ],
  }).overrideComponent(ArenaBookingConfirmedComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(ArenaBookingConfirmedComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  fixture.detectChanges();
  internals.error.set(null);
  internals.booking.set(doc);
  internals.loading.set(false);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Valor da linha do resumo com este rótulo (null quando não existe). */
function rowValue(fixture: ComponentFixture<ArenaBookingConfirmedComponent>, label: string): string | null {
  const row = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.bc-row')).find(
    (r) => text(r.querySelector('.bc-row-label')) === label,
  );
  return row ? text(row.querySelector('.bc-row-value')) : null;
}

describe('ArenaBookingConfirmedComponent — cashback', () => {
  useBlankFirebaseKey();

  it('paga com cashback: "Pago via Pix" sem o saldo, linha própria do cashback e nota ouvindo o lote', async () => {
    const fake = fakeCashbackService();
    const fixture = await create(fake, booking({ cashbackAppliedReais: 12.4 }));

    expect(rowValue(fixture, 'Pago via Pix')).toBe('R$ 107,60');
    expect(rowValue(fixture, 'Pago com cashback')).toBe('R$ 12,40');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-cashback-earned-note')).not.toBeNull();
    expect(fake.lotIds).toEqual(['pay_1']);
  });

  it('paga sem cashback: o resumo é o de antes', async () => {
    const fixture = await create(fakeCashbackService(), booking());
    expect(rowValue(fixture, 'Pago via Pix')).toBe('R$ 120,00');
    expect(rowValue(fixture, 'Pago com cashback')).toBeNull();
  });

  it('pagar na arena: sem nota de cashback', async () => {
    const fake = fakeCashbackService();
    const fixture = await create(
      fake,
      booking({ paymentChannel: 'onsite', paymentStatus: 'none', status: 'active', asaasPaymentId: null }),
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('app-cashback-earned-note')).toBeNull();
    expect(fake.lotIds).toEqual([]);
  });
});
