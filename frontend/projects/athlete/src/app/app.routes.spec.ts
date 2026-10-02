import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, RouterOutlet, provideRouter, type Route, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { onboardingGuard } from './auth/onboarding.guard';
import { TournamentLiveStore } from './tournaments/tournament-live.store';
import { RegistrationWizardStore } from './tournaments/registration/wizard/registration-wizard.store';

/** Rotas que existem justamente para quem ainda não tem sessão. */
const PUBLIC_PATHS = new Set([
  '',
  'entrar',
  'cadastro',
  'esqueci-senha',
  'email-enviado',
  'redefinir-senha',
  '**',
]);

describe('app.routes', () => {
  // O perfil compartilhado já ficou sem guard uma vez: as rules de `public_profiles` exigem
  // login, então o visitante deslogado tomava permission-denied e via "LINK INVÁLIDO" em vez
  // de ser mandado pro login com o perfil em ?redirect=.
  it('perfil público de atleta exige authGuard', () => {
    const route = routes.find((r) => r.path === 'atletas/:handle');
    expect(route).toBeDefined();
    expect(route!.canActivate).toContain(authGuard);
  });

  it('toda rota autenticada passa pelo authGuard', () => {
    const unguarded = routes
      .filter((r) => !PUBLIC_PATHS.has(r.path ?? ''))
      .filter((r) => !(r.canActivate ?? []).includes(authGuard))
      .map((r) => r.path);

    expect(unguarded).toEqual([]);
  });

  // `webUrl: '/cashback'` dos pushes `cashback_released`/`cashback_expiring` cai aqui.
  it('Meu cashback exige login e onboarding', () => {
    const route = routes.find((r) => r.path === 'cashback');
    expect(route).toBeDefined();
    expect(route!.canActivate).toEqual([authGuard, onboardingGuard]);
  });
});

/** O que cada tela da árvore de `torneios/:id` enxergou ao nascer. */
interface Visit {
  path: string | undefined;
  id: string | null;
  live: TournamentLiveStore | null;
  wizard: RegistrationWizardStore | null;
}

const visits: Visit[] = [];

@Component({ template: '<router-outlet />', imports: [RouterOutlet] })
class ProbeComponent {
  constructor() {
    const route = inject(ActivatedRoute).snapshot;
    visits.push({
      path: route.routeConfig?.path,
      id: route.paramMap.get('id'),
      live: inject(TournamentLiveStore, { optional: true }),
      wizard: inject(RegistrationWizardStore, { optional: true }),
    });
  }
}

/** A mesma configuração, com cada tela trocada pela sonda — inclusive dentro de `loadChildren`. */
function withProbes(config: Routes): Routes {
  return config.map((original) => {
    const route: Route = { ...original };
    if (route.loadComponent) route.loadComponent = () => ProbeComponent;
    if (route.children) route.children = withProbes(route.children);
    const load = original.loadChildren;
    if (load) route.loadChildren = async () => withProbes((await load()) as Routes);
    return route;
  });
}

// Os stores do torneio e do wizard são compartilhados por rotas IRMÃS (casca de abas, partida e
// Focus; os passos do wizard), então moram numa rota-mãe componentless e não em componente
// nenhum. Estes testes travam o que essa árvore promete, seja qual for o jeito de declará-la.
describe('app.routes — árvore de torneios/:id', () => {
  const firebase = environment.firebase as { apiKey: string };
  let realApiKey: string;
  let router: Router;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
    visits.length = 0;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(withProbes(routes.filter((r) => r.path?.startsWith('torneios/:id')))),
        {
          provide: AuthService,
          useValue: {
            authReady: signal(true),
            isAuthenticated: signal(true),
            user: signal({ uid: 'u1' }),
            devEmail: signal(null),
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  it('casca de abas, partida e Focus recebem o :id e dividem o mesmo TournamentLiveStore', async () => {
    await harness.navigateByUrl('/torneios/t1/visao-geral');
    await harness.navigateByUrl('/torneios/t1/partida/m1');
    await harness.navigateByUrl('/torneios/t1/focus/agora');
    await harness.navigateByUrl('/torneios/t1/categorias/c1/chave');

    expect(visits.map((v) => v.path)).toEqual([
      '',
      'visao-geral',
      'partida/:matchId',
      'focus',
      'agora',
      '',
      'categorias/:categoriaId',
      'chave',
    ]);
    // Herdam o `:id` as filhas diretas de `torneios/:id` (componentless); abaixo de uma casca
    // com componente, não — essas telas leem o torneio pelo store.
    expect(visits.map((v) => v.id)).toEqual(['t1', null, 't1', 't1', null, 't1', null, null]);
    expect(visits[0].live).toBeInstanceOf(TournamentLiveStore);
    expect(visits.every((v) => v.live === visits[0].live)).toBeTrue();
  });

  it('hoje (aposentada) cai no Focus do mesmo torneio', async () => {
    await harness.navigateByUrl('/torneios/t1/hoje');
    expect(router.url).toBe('/torneios/t1/focus/agora');
  });

  it('avaliar abre Minha inscrição com o diálogo', async () => {
    await harness.navigateByUrl('/torneios/t1/avaliar');
    expect(router.url).toBe('/torneios/t1/minha-inscricao?avaliar=1');
  });

  it('abas antigas viram sub-visões da categoria do ?categoria=', async () => {
    await harness.navigateByUrl('/torneios/t1/partidas?categoria=c1');
    expect(router.url).toBe('/torneios/t1/categorias/c1/partidas?categoria=c1');
    await harness.navigateByUrl('/torneios/t1/chaves');
    expect(router.url).toBe('/torneios/t1/categorias');
  });

  it('porteiro e passos do wizard recebem o :id e dividem o mesmo RegistrationWizardStore', async () => {
    await harness.navigateByUrl('/torneios/t1/inscricao');
    await harness.navigateByUrl('/torneios/t1/inscricao/parceiro');
    await harness.navigateByUrl('/torneios/t1/inscricao/pagamento');

    expect(visits.map((v) => v.path)).toEqual(['', 'parceiro', 'pagamento']);
    expect(visits.every((v) => v.id === 't1')).toBeTrue();
    expect(visits[0].wizard).toBeInstanceOf(RegistrationWizardStore);
    expect(visits.every((v) => v.wizard === visits[0].wizard)).toBeTrue();
    // O wizard não é filho de `torneios/:id`: o store do torneio não vaza pra ele.
    expect(visits.every((v) => v.live === null)).toBeTrue();
  });
});
