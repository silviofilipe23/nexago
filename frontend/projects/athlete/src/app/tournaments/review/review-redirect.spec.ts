import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type UrlTree } from '@angular/router';
import { reviewRedirect } from './review-redirect';

describe('reviewRedirect (torneios/:id/avaliar)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('leva para Minha inscrição com o diálogo aberto', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const tree = TestBed.runInInjectionContext(() =>
      reviewRedirect({ params: { id: 't1' } } as unknown as Parameters<typeof reviewRedirect>[0]),
    ) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/torneios/t1/minha-inscricao?avaliar=1');
  });
});
