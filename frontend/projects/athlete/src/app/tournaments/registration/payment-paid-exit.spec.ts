import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';
import { NxToastService } from '../../shared/feedback';
import { TournamentPaymentComponent } from './tournament-payment.component';

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

/** O pagamento cai pelo WEBHOOK: nenhum gesto na tela avisa que a inscrição fechou, e o único
 *  seam disso é o handler do listener — por isso o teste fala com ele, e não com um botão. A
 *  tela não é renderizada de propósito: montá-la dispararia a busca do torneio no Firestore
 *  real. */
describe('TournamentPaymentComponent — saída depois do pagamento', () => {
  let navigate: jasmine.Spy;
  // Sem chave, `createFirestore()` devolve null e a tela não busca nada: é o único jeito de
  // montá-la sem abrir conexão de verdade com o Firestore.
  const firebase = environment.firebase as { apiKey: string };
  let realApiKey: string;

  function create(): { onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void } {
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
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.returnValue(Promise.resolve(true));
    const fixture = TestBed.createComponent(TournamentPaymentComponent);
    return fixture.componentInstance as unknown as {
      onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void;
    };
  }

  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
    jasmine.clock().install();
  });
  afterEach(() => {
    jasmine.clock().uninstall();
    firebase.apiKey = realApiKey;
  });

  it('leva à aba "Minha inscrição" quando o pagamento confirma a inscrição', () => {
    const component = create();
    component.onRegistrationUpdate(registration({ isPaid: false }));
    expect(navigate).not.toHaveBeenCalled();

    component.onRegistrationUpdate(registration({ isPaid: true }));
    jasmine.clock().tick(3000);

    expect(navigate.calls.mostRecent().args[0]).toEqual(['/torneios', 't1', 'minha-inscricao']);
  });

  // Solo que pagou o integral ainda deve o parceiro: o fluxo NÃO acabou, e a tela já convida a
  // chamar alguém.
  it('não sai da tela quando a vaga foi paga mas o parceiro ainda falta', () => {
    const component = create();
    component.onRegistrationUpdate(registration({ isPaid: false, partnerPending: true }));
    component.onRegistrationUpdate(registration({ isPaid: true, partnerPending: true }));
    jasmine.clock().tick(3000);

    expect(navigate).not.toHaveBeenCalled();
  });

  // Só a minha cota caiu: a inscrição fecha quando o parceiro pagar a dele.
  it('não sai da tela com apenas a parcela do atleta paga', () => {
    const component = create();
    component.onRegistrationUpdate(registration({ isPaid: false }));
    component.onRegistrationUpdate(registration({ isPaid: false, sharePaidUids: ['me'] }));
    jasmine.clock().tick(3000);

    expect(navigate).not.toHaveBeenCalled();
  });

  // Abrir a tela com a inscrição JÁ paga (link antigo, voltar do navegador) não é "confirmou
  // agora": sequestrar a navegação nesse caso tiraria o atleta de onde ele pediu para estar.
  it('não sequestra a tela aberta com a inscrição já paga', () => {
    const component = create();
    // Primeiro snapshot do listener já vem pago (a tela abriu assim).
    component.onRegistrationUpdate(registration({ isPaid: true }));
    jasmine.clock().tick(3000);

    expect(navigate).not.toHaveBeenCalled();
  });
});
