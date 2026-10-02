import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ArenaCourtDoc, ArenaListItem, ArenaSlot } from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ArenaBookingPixPayment } from '../data/arena-bookings-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ArenaPaymentComponent } from './arena-payment.component';

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
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
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
    ...overrides,
  };
}

describe('ArenaPaymentComponent — cashback', () => {
  useBlankFirebaseKey();

  it('mostra o toggle antes de "Gerar Pix" quando há saldo usável', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(host(fixture).querySelector('.pm-pix-setup app-checkout-cashback-toggle [role="switch"]')).not.toBeNull();
  });

  it('ligado: o resumo ganha "Cashback −R$", o total e o botão caem', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(total(fixture)).toBe('R$ 120,00');

    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 107,60');
    expect(text(host(fixture).querySelector('.pm-pix-setup .pm-btn-primary'))).toBe('Gerar código Pix de R$ 107,60');
  });

  it('"Dividir com amigos" com o switch ligado: sem toggle e o total volta ao preço cheio', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.useCashback.set(true);
    internals.toggleSplitMode(true);
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 120,00');
  });

  it('Pix gerado: vale o que o servidor cobrou, mesmo que tenha aplicado menos que a prévia', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.useCashback.set(true);
    internals.pixPayment.set(pix({ cashbackAppliedReais: 0, chargedReais: 120 }));
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 120,00');

    internals.pixPayment.set(pix({ cashbackAppliedReais: 12.4, chargedReais: 107.6 }));
    fixture.detectChanges();
    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 107,60');
  });

  it('sem saldo usável: só a linha "Ganhe até" e o total cheio', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    expect(text(host(fixture).querySelector('.cbt-earn'))).toBe('Ganhe até 2% de volta neste pagamento');
    expect(total(fixture)).toBe('R$ 120,00');
  });

  it('recurso desligado: nada de cashback na tela', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }),
    );
    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(host(fixture).querySelector('.cbt-switch, .cbt-earn')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 120,00');
  });
});
