import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublicReviewSummary } from '../../data/tournament-reviews';
import { TournamentReviewAspectsComponent } from './tournament-review-aspects.component';

describe('TournamentReviewAspectsComponent', () => {
  function render(summary: PublicReviewSummary | null): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TournamentReviewAspectsComponent);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('mostra a média de cada aspecto com nota, na ordem da lista', () => {
    const host = render({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } });
    expect(host.textContent).toContain('Como os atletas avaliaram');
    expect([...host.querySelectorAll('.tra-label')].map((e) => e.textContent!.trim())).toEqual(['Organização geral', 'Premiação e kit']);
    expect([...host.querySelectorAll('.tra-value')].map((e) => e.textContent!.trim())).toEqual(['4,8', '3,4']);
    expect((host.querySelector('.tra-track span') as HTMLElement).style.width).toBe('96%');
  });

  it('abaixo de 3 avaliações, sem aspectos ou sem resumo: nada', () => {
    expect(render({ count: 2, average: null, aspects: { venue: 4 } }).querySelector('section')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ count: 23, average: 4.62, aspects: {} }).querySelector('section')).toBeNull();
    TestBed.resetTestingModule();
    expect(render(null).querySelector('section')).toBeNull();
  });
});
