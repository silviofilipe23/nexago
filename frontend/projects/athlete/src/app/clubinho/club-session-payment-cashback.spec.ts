import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ClubJoinPixPayment, ClubSession } from '../data/arena-clubs-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ClubSessionPaymentComponent } from './club-session-payment.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  session: WritableSignal<ClubSession | null>;
  method: WritableSignal<'pix' | 'onsite'>;
  useCashback: WritableSignal<boolean>;
  pix: WritableSignal<ClubJoinPixPayment | null>;
  confirmed: WritableSignal<boolean>;
  myMethod: WritableSignal<'pix' | 'onsite'>;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o construtor não ouve a sessão nem o participante — mesmo seam de
 *  `card-checkout.spec.ts`. A sessão é semeada à mão. */
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

function session(priceReais = 30, allowOnsitePayment = false): ClubSession {
  return {
    id: 's1',
    clubId: 'club1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    clubName: 'Clubinho da Manhã',
    description: null,
    date: '2026-10-12',
    startTime: '07:00',
    endTime: '09:00',
    startAt: null,
    courtNames: [],
    capacity: 12,
    priceReais,
    cancelWindowHours: 12,
    allowOnsitePayment,
    confirmedCount: 0,
    pendingCount: 0,
    status: 'scheduled',
  };
}

function pixPayment(overrides: Partial<ClubJoinPixPayment> = {}): ClubJoinPixPayment {
  return {
    sessionId: 's1',
    paymentId: 'pay_c',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountReais: 30,
    cashbackAppliedReais: 0,
    chargedReais: 30,
    ...overrides,
  };
}

function create(
  fake: FakeCashbackService,
  clubSession: ClubSession = session(),
): { fixture: ComponentFixture<ClubSessionPaymentComponent>; internals: Internals } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me', displayName: 'Ana' }) } },
      { provide: CashbackService, useValue: fake.asService() },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ sessionId: 's1' }) } } },
    ],
  }).overrideComponent(ClubSessionPaymentComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(ClubSessionPaymentComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  fixture.detectChanges();
  internals.session.set(clubSession);
  fixture.detectChanges();
  return { fixture, internals };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function host(fixture: ComponentFixture<ClubSessionPaymentComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('ClubSessionPaymentComponent — cashback', () => {
  useBlankFirebaseKey();

  it('toggle antes do botão; ligado, mostra o cashback e o que vai no PIX', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(host(fixture).querySelector('[role="switch"]')).not.toBeNull();
    expect(host(fixture).querySelector('.cp-cashback-summary')).toBeNull();

    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(text(host(fixture).querySelector('.cp-cashback-discount'))).toBe('−R$ 12,40');
    expect(text(host(fixture).querySelector('.cp-cashback-summary'))).toContain('Você paga R$ 17,60');
  });

  it('clubinho de R$ 5 (o mínimo): sem switch, só "Ganhe até"', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }), session(5));
    expect(host(fixture).querySelector('[role="switch"]')).toBeNull();
    expect(text(host(fixture).querySelector('.cbt-earn'))).toBe('Ganhe até 2% de volta neste pagamento');
  });

  it('PIX gerado mostra o valor cobrado, não o preço', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.pix.set(pixPayment({ cashbackAppliedReais: 12.4, chargedReais: 17.6 }));
    fixture.detectChanges();
    expect(text(host(fixture).querySelector('.cp-amount-row .cp-amount'))).toBe('R$ 17,60');
  });

  it('recurso desligado: nada de cashback', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }),
    );
    internals.useCashback.set(true);
    fixture.detectChanges();
    expect(host(fixture).querySelector('.cbt-switch, .cbt-earn, .cp-cashback-summary')).toBeNull();
  });

  it('pagar na arena: sem toggle', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ wallet: { availableCents: 1240 } }),
      session(30, true),
    );
    internals.method.set('onsite');
    fixture.detectChanges();
    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
  });
});
