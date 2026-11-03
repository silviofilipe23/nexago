import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { NxToastService } from '../../shared/feedback';
import { TournamentPaymentComponent, resolvePaymentMethods } from './tournament-payment.component';

/** Regra pura, sem montar nada. */
describe('resolvePaymentMethods', () => {
  it('oferece PIX e cartão no torneio que cobra pelo app', () => {
    expect(resolvePaymentMethods('appPixCard')).toEqual(['pix', 'card']);
  });

  it('não oferece nada no pagamento direto com o organizador', () => {
    expect(resolvePaymentMethods('directWithOrganizer')).toEqual([]);
  });

  it('trata modo ausente como cobrança pelo app (padrão do acervo)', () => {
    expect(resolvePaymentMethods(null)).toEqual(['pix', 'card']);
    expect(resolvePaymentMethods(undefined)).toEqual(['pix', 'card']);
  });

  it('respeita as formas aceitas pelo organizador', () => {
    expect(resolvePaymentMethods('appPixCard', ['pix'])).toEqual(['pix']);
    expect(resolvePaymentMethods('appPixCard', ['card'])).toEqual(['card']);
    expect(resolvePaymentMethods('appPixCard', ['card', 'pix'])).toEqual(['pix', 'card']);
  });

  it('formas ausentes, vazias ou fora do contrato valem as duas (acervo)', () => {
    expect(resolvePaymentMethods('appPixCard', undefined)).toEqual(['pix', 'card']);
    expect(resolvePaymentMethods('appPixCard', [])).toEqual(['pix', 'card']);
    expect(resolvePaymentMethods('appPixCard', ['boleto'])).toEqual(['pix', 'card']);
    expect(resolvePaymentMethods('appPixCard', 'pix')).toEqual(['pix', 'card']);
  });

  it('pagamento direto ignora as formas aceitas', () => {
    expect(resolvePaymentMethods('directWithOrganizer', ['pix'])).toEqual([]);
  });
});

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
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

function tournament(paymentMode: string, onlinePaymentMethods?: string[]): TournamentSummary {
  return {
    onlinePaymentMethods,
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: null,
    paymentMode,
    organizerPix: null,
    categories: [{ id: 'c1', categoryName: 'Masculina A', entryFee: 100, teamSize: 2 }],
  } as unknown as TournamentSummary;
}

/** A tela do pagamento com uma cobrança viva de cartão. Sem chave de Firebase o
 *  componente não busca nada — mesmo seam de `payment-paid-exit.spec.ts`. */
describe('TournamentPaymentComponent — cartão', () => {
  const firebase = environment.firebase as { apiKey: string };
  let realApiKey: string;

  interface Internals {
    onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void;
    listing: ReturnType<typeof signal<TournamentSummary | null>>;
    cardResult: ReturnType<typeof signal<{ paymentId: string; invoiceUrl: string; expiresAt: string; amountReais: number } | null>>;
    method: ReturnType<typeof signal<'pix' | 'card'>>;
    cardFeePercent: ReturnType<typeof signal<number>>;
  }

  function create(paymentMode = 'appPixCard', onlinePaymentMethods?: string[]) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
        {
          provide: NxToastService,
          useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
        },
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
    // O primeiro ciclo roda a effect de boot, que sem Firestore zera o `listing`
    // e desliga o loading. Semear antes disso seria semear para ser apagado.
    fixture.detectChanges();
    internals.listing.set(tournament(paymentMode, onlinePaymentMethods));
    internals.onRegistrationUpdate(registration());
    fixture.detectChanges();
    return { fixture, internals };
  }

  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  it('mostra o seletor de meio de pagamento no torneio que cobra pelo app', () => {
    const { fixture } = create();
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.tp-method-btn-title') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());

    expect(labels).toEqual(['Pix', 'Cartão de crédito']);
  });

  it('troca o rótulo do botão ao escolher cartão', () => {
    const { fixture, internals } = create();
    internals.method.set('card');
    fixture.detectChanges();

    const cta = fixture.nativeElement.querySelector('.tp-btn-primary') as HTMLElement;
    expect(cta.textContent).toContain('no cartão');
  });

  // O checkout é um link REAL: `window.open()` depois do await morre em bloqueador
  // de popup, e sem erro visível.
  it('renderiza o checkout como link para o Asaas, em nova aba', () => {
    const { fixture, internals } = create();
    internals.cardResult.set({
      paymentId: 'pay1',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      amountReais: 50,
    });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.tp-btn-primary') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://sandbox.asaas.com/i/pay1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('esconde o seletor com uma cobrança viva', () => {
    const { fixture, internals } = create();
    internals.cardResult.set({
      paymentId: 'pay1',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      amountReais: 50,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tp-method-toggle')).toBeNull();
  });

  function texts(fixture: { nativeElement: HTMLElement }, selector: string): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>).map(
      (el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  /** Valor da linha do resumo cujo rótulo começa com `label` (null quando a linha não existe). */
  function summaryValue(fixture: { nativeElement: HTMLElement }, label: string): string | null {
    const row = Array.from(fixture.nativeElement.querySelectorAll('.tp-summary-row') as NodeListOf<HTMLElement>).find(
      (r) => (r.querySelector('.tp-summary-label')?.textContent ?? '').trim().startsWith(label),
    );
    return row ? (row.querySelector('.tp-summary-value')?.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
  }

  it('torneio só Pix: sem seletor, direto no Pix', () => {
    const { fixture, internals } = create('appPixCard', ['pix']);
    internals.method.set('card');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tp-method-toggle')).toBeNull();
    expect(texts(fixture, 'button.tp-btn-primary')[0]).toContain('Gerar Pix');
  });

  it('torneio só cartão: sem seletor, direto no cartão (com a taxa no resumo e no botão)', () => {
    const { fixture, internals } = create('appPixCard', ['card']);
    internals.cardFeePercent.set(1.33);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tp-method-toggle')).toBeNull();
    // Parcela de R$ 50 × 1,33% = R$ 0,67.
    expect(summaryValue(fixture, 'Taxa de antecipação do cartão (1,33%)')).toBe('+R$ 0,67');
    expect(texts(fixture, 'button.tp-btn-primary')[0]).toBe('Pagar R$ 50,67 no cartão');
  });

  it('com taxa no cartão o Pix aparece como o mais barato, com o cartão riscado', () => {
    const { fixture, internals } = create();
    internals.cardFeePercent.set(1.33);
    fixture.detectChanges();

    expect(texts(fixture, '.tp-method-btn-was')).toEqual(['R$ 50,67']);
    expect(texts(fixture, '.tp-method-badge')).toEqual(['R$ 0,67 a menos que no cartão']);
    // Pix escolhido: nada de taxa do cartão no resumo nem no botão.
    expect(summaryValue(fixture, 'Taxa de antecipação')).toBeNull();
    expect(texts(fixture, 'button.tp-btn-primary')[0]).toBe('Gerar Pix de R$ 50,00');
  });

  it('cartão escolhido: a taxa entra no resumo e no total', () => {
    const { fixture, internals } = create();
    internals.cardFeePercent.set(1.33);
    internals.method.set('card');
    fixture.detectChanges();

    expect(summaryValue(fixture, 'Taxa de antecipação do cartão (1,33%)')).toBe('+R$ 0,67');
    expect(texts(fixture, '.tp-summary-total')).toEqual(['R$ 50,67']);
    expect(texts(fixture, 'button.tp-btn-primary')[0]).toBe('Pagar R$ 50,67 no cartão');
  });

  it('sem taxa no cartão (backend antigo): nenhum selo nem linha nova', () => {
    const { fixture, internals } = create();
    internals.method.set('card');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tp-method-badge')).toBeNull();
    expect(summaryValue(fixture, 'Taxa de antecipação')).toBeNull();
    expect(texts(fixture, 'button.tp-btn-primary')[0]).toBe('Pagar R$ 50,00 no cartão');
  });

  it('cartão gerado: vale o total e a taxa que o servidor cobrou', () => {
    const { fixture, internals } = create();
    internals.cardFeePercent.set(1.33);
    internals.cardResult.set({
      paymentId: 'pay1',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      amountReais: 50,
      chargedReais: 50.67,
      cardFeeReais: 0.67,
      cardFeePercent: 1.33,
    } as never);
    fixture.detectChanges();

    expect(summaryValue(fixture, 'Taxa de antecipação do cartão (1,33%)')).toBe('+R$ 0,67');
    expect(texts(fixture, '.tp-pix-amount')).toEqual(['Cartão de R$ 50,67']);
    expect(texts(fixture, '.tp-summary-total')).toEqual(['R$ 50,67']);
  });
});
