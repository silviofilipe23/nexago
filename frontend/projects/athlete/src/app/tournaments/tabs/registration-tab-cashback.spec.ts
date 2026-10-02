import { signal, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { CashbackService } from '../../data/cashback.service';
import { NxToastService } from '../../shared/feedback';
import { fakeCashbackService, type FakeCashbackService } from '../../../testing/cashback-service.fake';
import { TournamentLiveStore } from '../tournament-live.store';
import { RegistrationTabComponent } from './registration-tab.component';

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o componente não abre os listeners de perfis/convites — mesmo seam de
 *  `card-checkout.spec.ts`. A store fica vazia (`tournament() == null`): o `@for` de cards não
 *  renderiza nada, sobrando só a nota de cashback para o teste observar. */
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

/** `history.state` é o fallback do id (ver `RegistrationTabComponent.resolveCashbackPaymentId`)
 *  — `getCurrentNavigation()` só existe DURANTE a navegação que criou o componente, e
 *  `TestBed.createComponent` não passa por uma navegação real. */
function withHistoryState(state: Record<string, unknown> | null): void {
  history.replaceState(state, '');
}

function fakeStore(): TournamentLiveStore {
  return {
    tournament: signal(null),
    myRegistrations: signal([]),
    tournamentId: signal('t1'),
    matches: signal([]),
    enrolledByCategory: signal(new Map()),
    now: signal(new Date()),
    reviewInvite: signal(null),
    myReview: signal(null),
    duoNameOf: () => '',
  } as unknown as TournamentLiveStore;
}

function create(fake: FakeCashbackService): ComponentFixture<RegistrationTabComponent> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me', displayName: 'Ana' }) } },
      {
        provide: NxToastService,
        useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
      },
      { provide: TournamentLiveStore, useValue: fakeStore() },
      { provide: CashbackService, useValue: fake.asService() },
    ],
  });
  const fixture = TestBed.createComponent(RegistrationTabComponent);
  fixture.detectChanges();
  return fixture;
}

/** Navegação "em troca" pro torneio seguinte, sem passar por uma rota de verdade: o
 *  `RouteReuseStrategy` padrão REAPROVEITA esta instância (mesma config de rota, só o `:id`
 *  muda) — não há criação/destruição de componente, só um `NavigationEnd` chegando em
 *  `router.events`. `Router.events` é, por baixo, um `Subject` de verdade (não só uma
 *  `Observable`) — então dá pra empurrar o evento direto, sem montar rotas nem tocar a URL real
 *  do navegador (o que o resto desta suíte evita: outros specs sempre espiam `router.navigate`
 *  em vez de deixar uma navegação de verdade correr, porque `provideRouter([])` não tem rota
 *  nenhuma configurada). O `Router` continua o de verdade: `ActivatedRoute`/`RouterLink`/
 *  `createUrlTree`, que a nota de cashback usa no próprio template, seguem funcionando. */
function completeNavigation(router: Router, url: string): void {
  (router.events as Subject<NavigationEnd>).next(new NavigationEnd(2, url, url));
}

function host(fixture: ComponentFixture<RegistrationTabComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('RegistrationTabComponent — nota de cashback vinda do redirect de pagamento', () => {
  useBlankFirebaseKey();

  afterEach(() => withHistoryState(null));

  // Ruling 4: a tela de pagamento passa `cashbackPaymentId` no `state` do `router.navigate`
  // antes de mandar o atleta pra cá — sem isto a nota piscava no pagamento e sumia no redirect.
  it('renderiza a nota e ouve o lote quando o state da navegação traz o id da cobrança', () => {
    withHistoryState({ cashbackPaymentId: 'pay_9' });
    const fake = fakeCashbackService();
    const fixture = create(fake);

    expect(host(fixture).querySelector('app-cashback-earned-note')).not.toBeNull();
    expect(fake.lotIds).toEqual(['pay_9']);
  });

  it('sem id no state: nada de novo na página', () => {
    withHistoryState(null);
    const fixture = create(fakeCashbackService());

    expect(host(fixture).querySelector('app-cashback-earned-note')).toBeNull();
  });
});

// Ruling 6 (residual do review final): o RouteReuseStrategy padrão REAPROVEITA esta instância ao
// navegar de `/torneios/A/minha-inscricao` pra `/torneios/B/minha-inscricao` — sem recalcular o
// id a cada navegação, a nota do torneio A ficava grudada na tela do torneio B.
describe('RegistrationTabComponent — troca de torneio reaproveita a instância (Ruling 6)', () => {
  useBlankFirebaseKey();

  afterEach(() => withHistoryState(null));

  it('sem state novo na segunda navegação: a nota do torneio anterior some', async () => {
    withHistoryState({ cashbackPaymentId: 'pay_A' });
    const fixture = create(fakeCashbackService());
    expect(host(fixture).querySelector('app-cashback-earned-note')).not.toBeNull();

    withHistoryState(null);
    completeNavigation(TestBed.inject(Router), '/torneios/B/minha-inscricao');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host(fixture).querySelector('app-cashback-earned-note')).toBeNull();
  });

  it('com state novo na segunda navegação: mostra a nota do novo pagamento, não a do anterior', async () => {
    withHistoryState({ cashbackPaymentId: 'pay_A' });
    const fake = fakeCashbackService();
    const fixture = create(fake);
    expect(fake.lotIds).toEqual(['pay_A']);

    withHistoryState({ cashbackPaymentId: 'pay_B' });
    completeNavigation(TestBed.inject(Router), '/torneios/B/minha-inscricao');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host(fixture).querySelector('app-cashback-earned-note')).not.toBeNull();
    expect(fake.lotIds).toEqual(['pay_A', 'pay_B']);
  });
});
