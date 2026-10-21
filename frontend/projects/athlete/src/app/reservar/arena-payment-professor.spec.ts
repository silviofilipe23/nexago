import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ArenaCourtDoc, ArenaListItem, ArenaSlot } from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ArenaBookingError, mapCallableError, type ArenaBookingQuote } from '../data/arena-bookings-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { parseProfessorLink, type ProfessorLink } from '../professor/professor-links.model';
import { ProfessorLinksService } from '../professor/professor-links.service';
import { NxToastService } from '../shared/feedback';
import { fakeCashbackService } from '../../testing/cashback-service.fake';
import { SquadCodeFieldStubComponent } from '../../testing/squad-code-field.stub';
import { SquadCodeFieldComponent } from '../tournaments/registration/squad-code-field.component';
import { ArenaPaymentComponent } from './arena-payment.component';
import { bookingAsProfessorHint, bookingProfessorLink, professorDiscountSummaryLabel } from './booking-as-professor';
import { pixBookingCreateOptions } from './pix-booking-create-options';

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
  pixBookingId: WritableSignal<string | null>;
  bookAsProfessor: WritableSignal<boolean>;
  pixBookingOptions(): { asProfessor?: boolean };
  handleProfessorDenied(err: unknown): boolean;
  loadQuote(): Promise<void>;
  applyQuote(quote: ArenaBookingQuote): void;
  totalPrice(): number;
}

function quote(overrides: Partial<ArenaBookingQuote> = {}): ArenaBookingQuote {
  return {
    amountReais: 120,
    lineItems: [],
    couponApplied: false,
    couponId: null,
    couponDiscountReais: 0,
    professorDiscountPercent: 0,
    professorDiscountReais: 0,
    ...overrides,
  };
}

function link(overrides: Record<string, unknown> = {}): ProfessorLink {
  return parseProfessorLink('a1_me', {
    arenaId: 'a1',
    professorUserId: 'me',
    arenaName: 'Arena Sol',
    relationshipType: 'INDEPENDENT',
    status: 'ACTIVE',
    permissions: { canBookCourts: true, canManageOwnLessons: true, canAppearInArenaProfile: false },
    ...overrides,
  })!;
}

const firebase = environment.firebase as { apiKey: string };

function create(links: WritableSignal<readonly ProfessorLink[]>, toastError = jasmine.createSpy('error')) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
      { provide: NxToastService, useValue: { success: () => undefined, error: toastError, warning: () => undefined } },
      { provide: CashbackService, useValue: fakeCashbackService({ wallet: { availableCents: 0 } }).asService() },
      { provide: ProfessorLinksService, useValue: { links } },
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
  internals.arena.set({ id: 'a1', name: 'Arena Sol', onlinePaymentEnabled: true, onsitePaymentEnabled: true } as unknown as ArenaListItem);
  internals.court.set({ id: 'c1', name: 'Quadra 1', data: { sport: 'beach_tennis' } });
  internals.chain.set([{ courtId: 'c1', startTime: '19:00', endTime: '20:00', priceReais: 120 } as unknown as ArenaSlot]);
  internals.quotedTotal.set(120);
  internals.loading.set(false);
  fixture.detectChanges();
  return { fixture, internals, toastError };
}

function option(fixture: ComponentFixture<ArenaPaymentComponent>): HTMLButtonElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('#pm-professor button[role="switch"]');
}

describe('ArenaPaymentComponent — reservar como professor', () => {
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  it('sem vínculo nada muda: a opção não aparece e a reserva vai como atleta', () => {
    const { fixture, internals } = create(signal([]));
    expect((fixture.nativeElement as HTMLElement).querySelector('#pm-professor')).toBeNull();
    expect('asProfessor' in internals.pixBookingOptions()).toBeFalse();
  });

  it('vínculo ativo com "Reservar quadras": aparece desligada, com o tipo e a arena', () => {
    const { fixture, internals } = create(signal([link()]));
    const sw = option(fixture)!;
    expect(sw).not.toBeNull();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    const section = (fixture.nativeElement as HTMLElement).querySelector('#pm-professor')!;
    expect(section.textContent).toContain('Reservar como professor');
    expect(section.textContent).toContain('A Arena Sol vê na agenda que o horário é seu como professor.');
    expect(section.textContent).toContain('Independente');
    expect('asProfessor' in internals.pixBookingOptions()).toBeFalse();
  });

  it('ligada, manda asProfessor; se o vínculo some (suspenso ao vivo), volta a ser de atleta', () => {
    const links = signal<readonly ProfessorLink[]>([link()]);
    const { fixture, internals } = create(links);
    option(fixture)!.click();
    fixture.detectChanges();
    expect(option(fixture)!.getAttribute('aria-checked')).toBe('true');
    expect(internals.pixBookingOptions().asProfessor).toBeTrue();

    links.set([link({ status: 'SUSPENDED' })]);
    fixture.detectChanges();
    expect(option(fixture)).toBeNull();
    expect('asProfessor' in internals.pixBookingOptions()).toBeFalse();
  });

  it('ligar/desligar "como professor" cota de novo (o desconto do vínculo muda o preço)', () => {
    const { fixture, internals } = create(signal([link({ courtDiscountPercent: 20 })]));
    const requote = spyOn(internals, 'loadQuote').and.resolveTo();
    option(fixture)!.click();
    fixture.detectChanges();
    expect(requote).toHaveBeenCalledTimes(1);
    option(fixture)!.click();
    fixture.detectChanges();
    expect(requote).toHaveBeenCalledTimes(2);
  });

  it('dica da opção avisa o desconto do vínculo', () => {
    const { fixture } = create(signal([link({ courtDiscountPercent: 20 })]));
    const section = (fixture.nativeElement as HTMLElement).querySelector('#pm-professor')!;
    expect(section.textContent).toContain('Desconto de professor de 20% (não soma com promoção ou cupom).');
  });

  it('dica da opção avisa a faixa do dia do desconto', () => {
    const { fixture } = create(
      signal([link({ courtDiscountPercent: 20, courtDiscountStartTime: '08:00', courtDiscountEndTime: '17:00' })]),
    );
    const section = (fixture.nativeElement as HTMLElement).querySelector('#pm-professor')!;
    expect(section.textContent).toContain('Desconto de professor de 20% das 08:00 às 17:00 (não soma com promoção ou cupom).');
  });

  it('cotação com desconto de professor: linha no resumo e total da cotação', () => {
    const { fixture, internals } = create(signal([link({ courtDiscountPercent: 20 })]));
    internals.applyQuote(quote({ amountReais: 96, professorDiscountPercent: 20, professorDiscountReais: 24 }));
    fixture.detectChanges();
    const summary = (fixture.nativeElement as HTMLElement).querySelector('.pm-summary-card')!.textContent ?? '';
    expect(summary).toContain('Desconto de professor (20%)');
    expect(summary).toContain('24,00');
    expect(internals.totalPrice()).toBe(96);

    internals.applyQuote(quote({ amountReais: 120 }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.pm-summary-card')!.textContent).not.toContain('Desconto de professor');
  });

  it('trava depois que a reserva existe (o carimbo foi gravado com ela)', () => {
    const { fixture, internals } = create(signal([link()]));
    internals.pixBookingId.set('b1');
    fixture.detectChanges();
    expect(option(fixture)!.disabled).toBeTrue();
  });

  it('recusa do vínculo: desliga a opção e mostra a mensagem do servidor', () => {
    const { internals, toastError } = create(signal([link()]));
    internals.bookAsProfessor.set(true);
    const msg = 'A Arena Sol não liberou reservar como professor no seu vínculo. Você ainda pode reservar como atleta.';
    expect(internals.handleProfessorDenied(new ArenaBookingError(msg, 'PROFESSOR_DENIED'))).toBeTrue();
    expect(internals.bookAsProfessor()).toBeFalse();
    expect(toastError).toHaveBeenCalledWith('Não deu para reservar como professor', msg);
    expect(internals.handleProfessorDenied(new ArenaBookingError('Esse horário acabou de ser reservado.', 'SLOT_CONFLICT'))).toBeFalse();
  });
});

describe('bookingProfessorLink', () => {
  it('só o vínculo ATIVO desta arena com "Reservar quadras"', () => {
    expect(bookingProfessorLink([link()], 'a1')?.id).toBe('a1_me');
    expect(bookingProfessorLink([link()], 'a2')).toBeNull();
    expect(bookingProfessorLink([link()], '')).toBeNull();
    expect(bookingProfessorLink([link({ status: 'SUSPENDED' })], 'a1')).toBeNull();
    expect(bookingProfessorLink([link({ status: 'PENDING' })], 'a1')).toBeNull();
    expect(bookingProfessorLink([link({ status: 'INVITED' })], 'a1')).toBeNull();
    expect(bookingProfessorLink([link({ permissions: { canBookCourts: false } })], 'a1')).toBeNull();
  });

  it('texto da opção cai em "A arena" sem nome', () => {
    expect(bookingAsProfessorHint('  ')).toBe('A arena vê na agenda que o horário é seu como professor. Mesmo preço e regras.');
  });

  it('com desconto no vínculo, a dica troca "mesmo preço" pelo desconto', () => {
    expect(bookingAsProfessorHint('Arena Sol', 20)).toBe(
      'A Arena Sol vê na agenda que o horário é seu como professor. Desconto de professor de 20% (não soma com promoção ou cupom).',
    );
    expect(professorDiscountSummaryLabel(20)).toBe('Desconto de professor (20%)');
  });

  it('com faixa no desconto, a dica diz o horário; faixa vazia = o dia todo', () => {
    expect(bookingAsProfessorHint('Arena Sol', 20, { startTime: '08:00', endTime: '17:00' })).toBe(
      'A Arena Sol vê na agenda que o horário é seu como professor. Desconto de professor de 20% das 08:00 às 17:00 (não soma com promoção ou cupom).',
    );
    expect(bookingAsProfessorHint('Arena Sol', 20, { startTime: null, endTime: null })).toBe(
      'A Arena Sol vê na agenda que o horário é seu como professor. Desconto de professor de 20% (não soma com promoção ou cupom).',
    );
  });
});

describe('asProfessor nas opções e no erro da reserva', () => {
  it('pixBookingCreateOptions leva asProfessor só quando ligado', () => {
    const on = pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 1, couponCode: null, asProfessor: true });
    expect(on.asProfessor).toBeTrue();
    const off = pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 1, couponCode: null, asProfessor: false });
    expect('asProfessor' in off).toBeFalse();
  });

  it('permission-denied com motivo do vínculo vira PROFESSOR_DENIED com a mensagem do servidor', () => {
    for (const reason of ['no_link', 'not_active', 'permission_off']) {
      const err = mapCallableError({ code: 'functions/permission-denied', message: 'Motivo do vínculo.', details: { reason } });
      expect(err.isProfessorDenied).toBeTrue();
      expect(err.message).toBe('Motivo do vínculo.');
    }
  });

  it('bloqueio da arena segue BLOCKED_ATHLETE (não é recusa de professor)', () => {
    const err = mapCallableError({
      code: 'functions/permission-denied',
      message: 'Sua conta está bloqueada para reservar nesta arena.',
    });
    expect(err.isProfessorDenied).toBeFalse();
    expect(err.code).toBe('BLOCKED_ATHLETE');
  });
});
