import { TestBed } from '@angular/core/testing';
import { Component, provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import {
  provideRouter,
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ATHLETE_REDIRECT_INTENT_KEY } from './redirect-intent';

describe('authGuard', () => {
  const state = (url: string) => ({ url }) as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;

  function setup(isAuthenticated: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { authReady: signal(true), isAuthenticated: signal(isAuthenticated) },
        },
      ],
    });
  }

  function run(url: string): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() =>
      authGuard(route, state(url)),
    ) as Observable<boolean | UrlTree>;
    return firstValueFrom(result);
  }

  afterEach(() => localStorage.removeItem(ATHLETE_REDIRECT_INTENT_KEY));

  it('libera navegação quando autenticado', async () => {
    setup(true);
    expect(await run('/torneios/abc123/inscricao')).toBeTrue();
  });

  // Cenário do deep-link vindo do site: carga inicial da página, router.url ainda é '/'.
  // O guard deve preservar o destino tentado (state.url), não o router.url.
  it('deslogado: redireciona pro login levando o destino tentado em ?redirect=', async () => {
    setup(false);
    const result = await run('/torneios/abc123/inscricao');
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.root.children['primary'].segments.map((s) => s.path)).toEqual(['entrar']);
    expect(tree.queryParams['redirect']).toBe('/torneios/abc123/inscricao');
  });

  it('deslogado: persiste o destino tentado como intent (fallback de localStorage)', async () => {
    setup(false);
    await run('/torneios/abc123/inscricao');
    expect(localStorage.getItem(ATHLETE_REDIRECT_INTENT_KEY)).toBe('/torneios/abc123/inscricao');
  });
});

// Ciclo completo do deep-link vindo do site: carga inicial deslogado → login →
// navegação pro destino. Reproduz o fluxo real no router (não só o guard isolado).
describe('authGuard (integração com router)', () => {
  @Component({ template: '' })
  class StubComponent {}

  let isAuthenticated: WritableSignal<boolean>;

  beforeEach(() => {
    isAuthenticated = signal(false);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: '', pathMatch: 'full', redirectTo: 'entrar' },
          { path: 'entrar', component: StubComponent },
          { path: 'torneios/:id/inscricao', canActivate: [authGuard], component: StubComponent },
        ]),
        { provide: AuthService, useValue: { authReady: signal(true), isAuthenticated } },
      ],
    });
  });

  afterEach(() => localStorage.removeItem(ATHLETE_REDIRECT_INTENT_KEY));

  it('deslogado cai no /entrar com redirect; logado, a mesma URL chega na inscrição', async () => {
    const harness = await RouterTestingHarness.create('/torneios/abc123/inscricao');
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/entrar?redirect=%2Ftorneios%2Fabc123%2Finscricao');

    // O que o login faz após autenticar: navigateByUrl(returnUrl).
    isAuthenticated.set(true);
    await harness.navigateByUrl('/torneios/abc123/inscricao');
    expect(router.url).toBe('/torneios/abc123/inscricao');
  });
});
