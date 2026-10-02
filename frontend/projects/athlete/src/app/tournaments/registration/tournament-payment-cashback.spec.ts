import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { CashbackService } from '../../data/cashback.service';
import type { AthleteTournamentRegistration, PixPaymentResult } from '../../data/tournament-registrations-repository';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxToastService } from '../../shared/feedback';
import { fakeCashbackService, type FakeCashbackService } from '../../../testing/cashback-service.fake';
import { TournamentPaymentComponent } from './tournament-payment.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  listing: WritableSignal<TournamentSummary | null>;
  onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void;
  useCashback: WritableSignal<boolean>;
  method: WritableSignal<'pix' | 'card'>;
  pixResult: WritableSignal<PixPaymentResult | null>;
  cashbackAppliedReais(): number;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase a tela não busca nada — mesmo seam de `card-checkout.spec.ts`. */
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

function registration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'r1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamId: null,
    partnerPending: false,
    isPaid: false,
    waitlist: false,
    cancellationRequest: null,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: 'me',
    participantUids: ['me', 'bruno'],
    lgpdAcceptedUids: ['me'],
    uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    teamName: null,
    teamSize: null,
    captainUid: null,
    uniformByUid: {},
    substitutionHistory: [],
    holdExpiresAt: null,
    ...overrides,
  } as AthleteTournamentRegistration;
}

function tournament(entryFee: number): TournamentSummary {
  return {
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: null,
    paymentMode: 'appPixCard',
    organizerPix: null,
    categories: [{ id: 'c1', categoryName: 'Masculina A', entryFee, teamSize: 2 }],
  } as unknown as TournamentSummary;
}

function pix(overrides: Partial<PixPaymentResult> = {}): PixPaymentResult {
  return {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountReais: 50,
    cashbackAppliedReais: 0,
    chargedReais: 50,
    ...overrides,
  };
}

function create(
  fake: FakeCashbackService,
  entryFee = 100,
): { fixture: ComponentFixture<TournamentPaymentComponent>; internals: Internals } {
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
            paramMap: convertToParamMap({ id: 't1' }),
            queryParamMap: convertToParamMap({ categoria: 'c1' }),
          },
        },
      },
    ],
  }).overrideComponent(TournamentPaymentComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(TournamentPaymentComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  // O primeiro ciclo roda a effect de boot, que sem Firestore zera o `listing`.
  fixture.detectChanges();
  internals.listing.set(tournament(entryFee));
  internals.onRegistrationUpdate(registration());
  fixture.detectChanges();
  return { fixture, internals };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function host(fixture: ComponentFixture<TournamentPaymentComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Valor da linha "Cashback" do resumo (null quando a linha não existe). */
function cashbackSummary(fixture: ComponentFixture<TournamentPaymentComponent>): string | null {
  const row = Array.from(host(fixture).querySelectorAll('.tp-summary-row')).find(
    (r) => text(r.querySelector('.tp-summary-label')) === 'Cashback',
  );
  return row ? text(row.querySelector('.tp-summary-value')) : null;
}

function total(fixture: ComponentFixture<TournamentPaymentComponent>): string {
  return text(host(fixture).querySelector('.tp-summary-total'));
}

function cta(fixture: ComponentFixture<TournamentPaymentComponent>): string {
  return text(host(fixture).querySelector('.tp-pix-block .tp-btn-primary'));
}

describe('TournamentPaymentComponent — cashback', () => {
  useBlankFirebaseKey();

  it('toggle antes do CTA; ligado, o CTA e o resumo caem', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(host(fixture).querySelector('.tp-pix-block [role="switch"]')).not.toBeNull();
    expect(cta(fixture)).toBe('Gerar Pix de R$ 50,00');

    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 37,60');
    expect(cta(fixture)).toBe('Gerar Pix de R$ 37,60');
  });

  it('cartão: o aviso do mínimo fala em cartão e o botão leva o valor cobrado', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 5000 } }));
    internals.method.set('card');
    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(text(host(fixture).querySelector('.cbt-sub'))).toBe('Usando R$ 45,00 (o mínimo de R$ 5,00 vai no cartão)');
    expect(cta(fixture)).toBe('Pagar R$ 5,00 no cartão');
  });

  it('parcela trocada para baixo do mínimo depois de ligar: o desconto some e nada é pedido', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }), 8);
    const [share, full] = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.tp-amount-btn'));
    full.click();
    internals.useCashback.set(true);
    fixture.detectChanges();
    expect(total(fixture)).toBe('R$ 5,00');

    share.click();
    fixture.detectChanges();

    expect(internals.cashbackAppliedReais()).toBe(0);
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 4,00');
    expect(host(fixture).querySelector('.cbt-earn')).not.toBeNull();
  });

  it('Pix gerado: o valor e o resumo vêm do que o servidor cobrou', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.pixResult.set(pix({ cashbackAppliedReais: 12.4, chargedReais: 37.6 }));
    fixture.detectChanges();

    expect(text(host(fixture).querySelector('.tp-pix-amount'))).toBe('Pix de R$ 37,60');
    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 37,60');
    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
  });

  it('recurso desligado: nada de cashback no checkout', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }),
    );
    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(host(fixture).querySelector('.cbt-switch, .cbt-earn')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 50,00');
  });

  it('inscrição já paga não mostra desconto no resumo', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.useCashback.set(true);
    internals.onRegistrationUpdate(registration({ isPaid: true }));
    fixture.detectChanges();

    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 50,00');
  });
});
