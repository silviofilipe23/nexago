import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TournamentReviewInvite } from '../../data/tournament-reviews';
import { TournamentReviewCtaComponent } from './tournament-review-cta.component';

const NOW = new Date('2026-10-06T15:00:00Z');

function invite(overrides: Partial<TournamentReviewInvite> = {}): TournamentReviewInvite {
  return { tournamentId: 't1', tournamentName: 'Copa', coverUrl: null, closesAt: new Date('2026-10-11T13:00:00Z'), status: 'pending', ...overrides };
}

describe('TournamentReviewCtaComponent', () => {
  function render(value: TournamentReviewInvite | null, myOverall: number | null = null): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const fixture = TestBed.createComponent(TournamentReviewCtaComponent);
    fixture.componentRef.setInput('invite', value);
    fixture.componentRef.setInput('myOverall', myOverall);
    fixture.componentRef.setInput('now', NOW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sem convite não mostra nada', () => {
    expect(render(null).textContent?.trim()).toBe('');
  });

  it('pendente pede a avaliação com link ?avaliar=1', () => {
    const el = render(invite());
    expect(el.textContent).toContain('Como foi o torneio Copa?');
    expect(el.textContent).toContain('fecha em 11/10');
    expect(el.querySelector('a')!.getAttribute('href')).toContain('avaliar=1');
  });

  it('enviado mostra a nota e permite editar', () => {
    const el = render(invite({ status: 'submitted' }), 4);
    expect(el.textContent).toContain('Você avaliou ★ 4');
    expect(el.textContent).toContain('Editar');
  });

  it('encerrado só informa a data', () => {
    const el = render(invite({ closesAt: NOW }));
    expect(el.textContent).toContain('Avaliação encerrada em');
    expect(el.querySelector('a')).toBeNull();
  });
});
