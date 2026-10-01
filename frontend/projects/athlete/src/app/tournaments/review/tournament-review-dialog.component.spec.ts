import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TournamentReviewSubmitter } from '../../data/tournament-review-submitter';
import { TournamentReviewError } from '../../data/tournament-reviews-repository';
import type { MyTournamentReview, TournamentReviewInvite } from '../../data/tournament-reviews';
import { TournamentReviewDialogComponent } from './tournament-review-dialog.component';

const INVITE: TournamentReviewInvite = {
  tournamentId: 't1',
  tournamentName: 'Copa Areia',
  coverUrl: null,
  closesAt: new Date('2030-10-15T13:00:00Z'),
  status: 'pending',
};

describe('TournamentReviewDialogComponent', () => {
  let submitter: jasmine.SpyObj<TournamentReviewSubmitter>;

  function setup(invite: TournamentReviewInvite = INVITE, existing: MyTournamentReview | null = null) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: TournamentReviewSubmitter, useValue: submitter }],
    });
    const fixture = TestBed.createComponent(TournamentReviewDialogComponent);
    fixture.componentRef.setInput('invite', invite);
    fixture.componentRef.setInput('existing', existing);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const click = (selector: string) => {
      (el.querySelector(selector) as HTMLElement).click();
      fixture.detectChanges();
    };
    return { fixture, el, click };
  }

  beforeEach(() => {
    submitter = jasmine.createSpyObj<TournamentReviewSubmitter>('TournamentReviewSubmitter', ['submit']);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('pergunta pelo torneio e não envia sem nota geral', () => {
    const { el } = setup();
    expect(el.textContent).toContain('Como foi o torneio Copa Areia?');
    expect((el.querySelector('.trv-btn-primary') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('envia nota, aspecto e comentário e avisa o host', async () => {
    submitter.submit.and.resolveTo({ created: true });
    const { fixture, el, click } = setup();
    const emitted: { created: boolean }[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));

    click('button[data-overall="4"]');
    expect(el.textContent).toContain('Bom');
    click('button[data-aspect="schedule"][data-star="2"]');
    const textarea = el.querySelector('.trv-comment') as HTMLTextAreaElement;
    textarea.value = 'Atrasou';
    textarea.dispatchEvent(new Event('input'));
    click('.trv-btn-primary');
    await fixture.whenStable();

    expect(submitter.submit).toHaveBeenCalledOnceWith({ tournamentId: 't1', overall: 4, aspects: { schedule: 2 }, comment: 'Atrasou' });
    expect(emitted).toEqual([{ created: true }]);
  });

  it('tocar de novo na mesma estrela do aspecto limpa a nota', async () => {
    submitter.submit.and.resolveTo({ created: true });
    const { fixture, click } = setup();
    click('button[data-overall="5"]');
    click('button[data-aspect="venue"][data-star="3"]');
    click('button[data-aspect="venue"][data-star="3"]');
    click('.trv-btn-primary');
    await fixture.whenStable();
    expect(submitter.submit.calls.mostRecent().args[0].aspects).toEqual({});
  });

  it('edição chega preenchida e o botão vira Salvar alterações', () => {
    const { el } = setup({ ...INVITE, status: 'submitted' }, { overall: 3, aspects: { venue: 2 }, comment: 'Bom torneio' });
    expect(el.querySelector('button[data-overall="3"]')!.getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('button[data-aspect="venue"][data-star="2"]')!.getAttribute('aria-pressed')).toBe('true');
    expect((el.querySelector('.trv-comment') as HTMLTextAreaElement).value).toBe('Bom torneio');
    expect(el.querySelector('.trv-btn-primary')!.textContent).toContain('Salvar alterações');
  });

  it('erro do servidor fica no diálogo e nada é emitido', async () => {
    submitter.submit.and.rejectWith(new TournamentReviewError('A avaliação deste torneio foi encerrada.'));
    const { fixture, el, click } = setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));

    click('button[data-overall="2"]');
    click('.trv-btn-primary');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('A avaliação deste torneio foi encerrada.');
    expect(emitted).toEqual([]);
  });
});
