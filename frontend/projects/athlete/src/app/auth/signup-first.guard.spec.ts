import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ATHLETE_REDIRECT_INTENT_KEY } from './redirect-intent';
import { signupFirstGuard } from './signup-first.guard';

// O link `/convite-dupla/:id` é feito para quem NÃO tem conta: cair no login (o padrão do
// `authGuard`) era mandar o convidado para uma porta que ele não tem como abrir.
describe('signupFirstGuard', () => {
  @Component({ template: '' })
  class StubComponent {}

  let isAuthenticated: WritableSignal<boolean>;

  beforeEach(() => {
    isAuthenticated = signal(false);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'cadastro', component: StubComponent },
          { path: 'entrar', component: StubComponent },
          { path: 'convite-dupla/:id', canActivate: [signupFirstGuard, authGuard], component: StubComponent },
        ]),
        { provide: AuthService, useValue: { authReady: signal(true), isAuthenticated } },
      ],
    });
  });

  afterEach(() => localStorage.removeItem(ATHLETE_REDIRECT_INTENT_KEY));

  it('deslogado vai pro cadastro com o convite em ?redirect= e quem chamou em ref/de', async () => {
    await RouterTestingHarness.create('/convite-dupla/ext-1?ref=uid-ana&de=Ana');
    const router = TestBed.inject(Router);
    const tree = router.parseUrl(router.url);

    expect(tree.root.children['primary'].segments.map((s) => s.path)).toEqual(['cadastro']);
    expect(tree.queryParams).toEqual({ redirect: '/convite-dupla/ext-1?ref=uid-ana&de=Ana', ref: 'uid-ana', de: 'Ana' });
    expect(localStorage.getItem(ATHLETE_REDIRECT_INTENT_KEY)).toBe('/convite-dupla/ext-1?ref=uid-ana&de=Ana');
  });

  it('link sem ref/de também chega ao cadastro', async () => {
    await RouterTestingHarness.create('/convite-dupla/ext-1');
    const router = TestBed.inject(Router);

    expect(router.url).toBe('/cadastro?redirect=%2Fconvite-dupla%2Fext-1');
  });

  it('logado abre o convite direto', async () => {
    isAuthenticated.set(true);
    await RouterTestingHarness.create('/convite-dupla/ext-1?ref=uid-ana');

    expect(TestBed.inject(Router).url).toBe('/convite-dupla/ext-1?ref=uid-ana');
  });
});
