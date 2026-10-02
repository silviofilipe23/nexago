import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App, chromeHiddenForUrl } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});

describe('chromeHiddenForUrl', () => {
  // Push `cashback_released`/`cashback_expiring` abre `webUrl: '/cashback'`, e o card do painel
  // também leva pra lá — sem entrar em SHELL_ROUTE_PREFIXES, a página perdia a moldura do painel
  // (sidebar descolada, padding de container em vez de --immersive).
  it('usa a moldura do painel em /cashback', () => {
    expect(chromeHiddenForUrl('/cashback')).toBe(true);
  });
});
