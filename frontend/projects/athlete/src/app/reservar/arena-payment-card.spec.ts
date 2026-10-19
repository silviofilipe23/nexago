import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ArenaCourtDoc, ArenaListItem, ArenaSlot } from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ArenaBookingCardPayment, ArenaBookingPixPayment } from '../data/arena-bookings-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ArenaPaymentComponent } from './arena-payment.component';
import { SquadCodeFieldComponent } from '../tournaments/registration/squad-code-field.component';
import { SquadCodeFieldStubComponent } from '../../testing/squad-code-field.stub';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  arena: WritableSignal<ArenaListItem | null>;
  court: WritableSignal<ArenaCourtDoc | null>;
  chain: WritableSignal<ArenaSlot[]>;
  quotedTotal: WritableSignal<number | null>;
  useCashback: WritableSignal<boolean>;
  pixPayment: WritableSignal<ArenaBookingPixPayment | null>;
  cardPayment: WritableSignal<ArenaBookingCardPayment | null>;
  pixExpired: WritableSignal<boolean>;
  selectMethod(method: 'pix' | 'card' | 'onsite'): void;
  switchCardToPix(): void;
  squadDiscountPct: WritableSignal<number>;
  squadFeePercent: WritableSignal<number | null>;
  squadError: WritableSignal<string | null>;
  selectedMethod: WritableSignal<'pix' | 'card' | 'onsite'>;
  toggleSplitMode(on: boolean): void;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o `load()` para no primeiro `if` e não busca nada — mesmo seam de
 *  `card-checkout.spec.ts`. A tela é semeada à mão depois disso. */
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

function create(fake: FakeCashbackService): { fixture: ComponentFixture<ArenaPaymentComponent>; internals: Internals } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
      {
        provide: NxToastService,
        useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
      },
      { provide: CashbackService, useValue: fake.asService() },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ arenaId: 'a1' }),
            queryParamMap: convertToParamMap({ courtId: 'c1', date: '2026-10-12', time: '19:00', duration: '1' }),
          },
        },
      },
    ],
  }).overrideComponent(ArenaPaymentComponent, {
    remove: { imports: [AtPanelShellComponent, SquadCodeFieldComponent] },
    add: { imports: [PanelShellStubComponent, SquadCodeFieldStubComponent] },
  });

  const fixture = TestBed.createComponent(ArenaPaymentComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  fixture.detectChanges();
  internals.error.set(null);
  internals.arena.set({
    id: 'a1',
    name: 'Arena Sol',
    onlinePaymentEnabled: true,
    onsitePaymentEnabled: true,
  } as unknown as ArenaListItem);
  internals.court.set({ id: 'c1', name: 'Quadra 1', data: { sport: 'beach_tennis' } });
  internals.chain.set([{ courtId: 'c1', startTime: '19:00', endTime: '20:00', priceReais: 120 } as unknown as ArenaSlot]);
  internals.quotedTotal.set(120);
  internals.loading.set(false);
  fixture.detectChanges();
  return { fixture, internals };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function host(fixture: ComponentFixture<ArenaPaymentComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Valor da linha "Cashback" do resumo (null quando a linha não existe). */
function cashbackSummary(fixture: ComponentFixture<ArenaPaymentComponent>): string | null {
  const row = Array.from(host(fixture).querySelectorAll('.pm-summary-row')).find(
    (r) => text(r.querySelector('.pm-summary-label')) === 'Cashback',
  );
  return row ? text(row.querySelector('.pm-summary-value')) : null;
}

function total(fixture: ComponentFixture<ArenaPaymentComponent>): string {
  return text(host(fixture).querySelector('.pm-summary-total'));
}

function pix(overrides: Partial<ArenaBookingPixPayment> = {}): ArenaBookingPixPayment {
  return {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountToPayNowReais: 120,
    cashbackAppliedReais: 0,
    chargedReais: 120,
    squadDiscountReais: 0,
    ...overrides,
  };
}

function card(overrides: Partial<ArenaBookingCardPayment> = {}): ArenaBookingCardPayment {
  return {
    paymentId: 'pay_c1',
    invoiceUrl: 'https://www.asaas.com/i/pay_c1',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountToPayNowReais: 120,
    cashbackAppliedReais: 0,
    chargedReais: 120,
    squadDiscountReais: 0,
    ...overrides,
  };
}

describe('ArenaPaymentComponent — cartão', () => {
  useBlankFirebaseKey();

  it('oferece Cartão de crédito ao lado do Pix e do pagamento na arena', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    const methods = Array.from(host(fixture).querySelectorAll('.pm-method-card')).map((b) => text(b));
    expect(methods.some((m) => m.startsWith('Cartão de crédito'))).toBeTrue();
  });

  it('cartão escolhido: sem "dividir com amigos", botão diz o valor no cartão', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    internals.selectMethod('card');
    fixture.detectChanges();

    expect(host(fixture).querySelector('.pm-split-tabs')).toBeNull();
    const buttons = Array.from(host(fixture).querySelectorAll('.pm-pix-setup button')).map((b) => text(b));
    expect(buttons).toContain('Pagar R$ 120,00 no cartão');
    expect(total(fixture)).toBe('R$ 120,00');
  });

  it('cartão escolhido com "dividir" ligado antes: a divisão não vale para o cartão', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    internals.toggleSplitMode(true);
    internals.selectMethod('card');
    fixture.detectChanges();

    expect(host(fixture).querySelector('.pm-cpf-input')).not.toBeNull();
  });

  it('cobrança de cartão viva: link real para o checkout, sem trocar de meio por fora', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    internals.selectMethod('card');
    internals.cardPayment.set(card({ chargedReais: 108 }));
    fixture.detectChanges();

    const link = host(fixture).querySelector('a.pm-btn-primary') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('https://www.asaas.com/i/pay_c1');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(text(host(fixture).querySelector('.pm-pix-block'))).toContain('R$ 108,00');

    internals.selectMethod('onsite');
    expect(internals.selectedMethod()).toBe('card');
  });

  it('com um Pix vivo, escolher o cartão não troca o meio (sai pelo "Cancelar este Pix")', () => {
    const { internals } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    internals.pixPayment.set({
      paymentId: 'pay_1', qrCode: '000201', qrCodeBase64: '', expiresAt: new Date(Date.now() + 600_000).toISOString(),
      amountToPayNowReais: 120, cashbackAppliedReais: 0, chargedReais: 120, squadDiscountReais: 0,
    });

    internals.selectMethod('card');

    expect(internals.selectedMethod()).toBe('pix');
  });

  it('"Pagar com Pix" volta para o Pix sem a cobrança do cartão', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    internals.selectMethod('card');
    internals.cardPayment.set(card());
    fixture.detectChanges();

    internals.switchCardToPix();
    fixture.detectChanges();

    expect(internals.selectedMethod()).toBe('pix');
    expect(internals.cardPayment()).toBeNull();
    expect(host(fixture).querySelector('.pm-split-tabs')).not.toBeNull();
  });

  it('prazo do cartão acabou: oferece abrir um novo pagamento', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    internals.selectMethod('card');
    internals.cardPayment.set(card());
    internals.pixExpired.set(true);
    fixture.detectChanges();

    const buttons = Array.from(host(fixture).querySelectorAll('.pm-placeholder-block button')).map((b) => text(b));
    expect(buttons).toContain('Abrir novo pagamento');
  });
});
