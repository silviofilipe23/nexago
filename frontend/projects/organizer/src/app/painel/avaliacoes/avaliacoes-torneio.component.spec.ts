import { Component, provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AnonymousReview, TournamentReviewSummary } from '../data/tournament-reviews';
import type { OrganizerTournament } from '../data/tournament.model';
import { OgBellComponent } from '../shell/og-bell.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { AvaliacoesTorneioComponent } from './avaliacoes-torneio.component';

/** `og-bell` de verdade abre `onSnapshot` contra o Firestore — sem sentido aqui. */
@Component({ selector: 'og-bell', template: '' })
class OgBellStub {}

type ReviewTournament = Pick<OrganizerTournament, 'name' | 'status' | 'endAt'>;

interface Internals {
  now: WritableSignal<Date>;
  tournament: WritableSignal<ReviewTournament | null>;
  summary: WritableSignal<TournamentReviewSummary | null>;
  reviews: WritableSignal<AnonymousReview[]>;
  reviewsFailed: WritableSignal<boolean>;
}

const NOW = new Date('2026-10-06T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const COPA: ReviewTournament = { name: 'Copa Aurora', status: 'concluido', endAt: new Date(NOW.getTime() - 2 * DAY) };

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    tournamentStartAt: null,
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
    opensAt: null,
    closesAt: new Date('2026-10-15T13:00:00Z'),
    ...over,
  };
}

function review(id: string, overall: 1 | 2 | 3 | 4 | 5, comment: string | null, shuffleKey: number, aspects: AnonymousReview['aspects'] = {}): AnonymousReview {
  return { id, overall, aspects, comment, shuffleKey };
}

describe('AvaliacoesTorneioComponent', () => {
  let fixture: ComponentFixture<AvaliacoesTorneioComponent>;

  async function mount(seed: {
    tournament: ReviewTournament | null;
    summary?: TournamentReviewSummary | null;
    reviews?: AnonymousReview[];
    reviewsFailed?: boolean;
  }): Promise<HTMLElement> {
    TestBed.overrideComponent(OgPageHeaderComponent, { remove: { imports: [OgBellComponent] }, add: { imports: [OgBellStub] } });
    await TestBed.configureTestingModule({
      imports: [AvaliacoesTorneioComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AvaliacoesTorneioComponent);
    // `id` vazio: o efeito zera tudo e não abre listener nenhum. Semeia depois.
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.now.set(NOW);
    internals.tournament.set(seed.tournament);
    internals.summary.set(seed.summary ?? null);
    internals.reviews.set(seed.reviews ?? []);
    internals.reviewsFailed.set(seed.reviewsFailed ?? false);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const textOf = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ');
  const commentTexts = (host: HTMLElement) => [...host.querySelectorAll('.og-rv-comment-text')].map((e) => e.textContent!.trim());

  it('sem resumo e torneio por vir', async () => {
    const host = await mount({ tournament: { name: 'Copa Aurora', status: 'inscricoes', endAt: new Date(NOW.getTime() + 3 * DAY) } });
    expect(textOf(host)).toContain('A avaliação abre quando o torneio terminar.');
  });

  it('sem resumo e torneio encerrado há um mês', async () => {
    const host = await mount({ tournament: { name: 'Copa Aurora', status: 'concluido', endAt: new Date(NOW.getTime() - 30 * DAY) } });
    expect(textOf(host)).toContain('Este torneio terminou antes de as avaliações existirem.');
  });

  it('sem resumo e sem torneio', async () => {
    const host = await mount({ tournament: null });
    expect(textOf(host)).toContain('Torneio não encontrado.');
  });

  it('menos de 3: só a contagem, sem média nem comentários', async () => {
    const host = await mount({ tournament: COPA, summary: summary({ count: 2, average: null, distribution: null, aspects: null }) });
    expect(textOf(host)).toContain('2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.');
    expect(textOf(host)).toContain('Aberta até 15/10');
    expect(host.querySelector('.og-rv-average')).toBeNull();
    expect(host.querySelector('.og-rv-comment')).toBeNull();
  });

  it('completo: média, taxa de resposta, janela, distribuição e aspectos do mais fraco ao mais forte', async () => {
    const host = await mount({ tournament: COPA, summary: summary() });
    expect(host.querySelector('.og-rv-average')!.textContent).toContain('4,6');
    const text = textOf(host);
    expect(text).toContain('23 avaliações');
    expect(text).toContain('23 de 42 atletas');
    expect(text).toContain('Aberta até 15/10');
    expect(host.querySelectorAll('og-bar-row').length).toBe(5);
    expect([...host.querySelectorAll('.og-rv-aspect-name')].map((e) => e.textContent!.trim())).toEqual([
      'Cumprimento dos horários',
      'Organização geral',
    ]);
  });

  it('janela vencida aparece como Encerrada mesmo com status open', async () => {
    const host = await mount({ tournament: COPA, summary: summary({ closesAt: new Date(NOW.getTime() - 60_000) }) });
    expect(textOf(host)).toContain('Encerrada');
    expect(textOf(host)).not.toContain('Aberta até');
  });

  it('comentários: só com texto, por shuffleKey, e o filtro 1–2★', async () => {
    const host = await mount({
      tournament: COPA,
      summary: summary(),
      reviews: [
        review('a', 5, 'Tudo pontual', 0.9, { schedule: 5 }),
        review('b', 1, 'Atrasou duas horas', 0.1),
        review('c', 4, null, 0.5),
      ],
    });
    expect(commentTexts(host)).toEqual(['Atrasou duas horas', 'Tudo pontual']);
    expect(textOf(host)).toContain('Cumprimento dos horários 5★');

    const low = [...host.querySelectorAll<HTMLButtonElement>('.og-rv-filter button')].find((b) => b.textContent!.includes('1–2'))!;
    low.click();
    await fixture.whenStable();
    expect(commentTexts(host)).toEqual(['Atrasou duas horas']);
  });

  it('filtro 1–2★ sem resultado tem texto próprio', async () => {
    const host = await mount({ tournament: COPA, summary: summary(), reviews: [review('a', 5, 'Tudo pontual', 0.9)] });
    const low = [...host.querySelectorAll<HTMLButtonElement>('.og-rv-filter button')].find((b) => b.textContent!.includes('1–2'))!;
    low.click();
    await fixture.whenStable();
    expect(textOf(host)).toContain('Nenhum comentário com 1 ou 2 estrelas.');
  });

  it('falha nos comentários não derruba os números', async () => {
    const host = await mount({ tournament: COPA, summary: summary(), reviewsFailed: true });
    expect(textOf(host)).toContain('Não foi possível carregar os comentários.');
    expect(host.querySelector('.og-rv-average')!.textContent).toContain('4,6');
  });
});
