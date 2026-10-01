import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublicReviewSummary } from '../../../lib/tournament-reviews';
import { TournamentReviewAspects } from './tournament-review-aspects';

describe('TournamentReviewAspects (site)', () => {
  beforeEach(async () => {
    // O site roda zoneless: sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [TournamentReviewAspects],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(summary: PublicReviewSummary | null): HTMLElement {
    const f = TestBed.createComponent(TournamentReviewAspects);
    f.componentRef.setInput('summary', summary);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('mostra a média de cada aspecto com nota, na ordem da lista', () => {
    const host = render({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } });
    expect(host.textContent).toContain('Como os atletas avaliaram');
    expect([...host.querySelectorAll('li [data-label]')].map((e) => e.textContent!.trim())).toEqual(['Organização geral', 'Premiação e kit']);
    expect([...host.querySelectorAll('li [data-value]')].map((e) => e.textContent!.trim())).toEqual(['4,8', '3,4']);
    expect((host.querySelector('li [data-bar]') as HTMLElement).style.width).toBe('96%');
  });

  it('abaixo de 3, sem aspectos ou sem resumo: nada', () => {
    expect(render({ count: 2, average: null, aspects: { venue: 4 } }).querySelector('section')).toBeNull();
    expect(render({ count: 23, average: 4.62, aspects: {} }).querySelector('section')).toBeNull();
    expect(render(null).querySelector('section')).toBeNull();
  });
});
