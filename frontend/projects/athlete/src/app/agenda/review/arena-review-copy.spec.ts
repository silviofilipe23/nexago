import type { ReviewableBooking } from '../../data/pending-arena-review';
import {
  REVIEW_DEFAULT_TAGS,
  REVIEW_HIGHLIGHT_TAGS,
  REVIEW_XP_REWARD,
  composeReviewComment,
  ratingLabel,
  reviewSessionSubtitle,
} from './arena-review-copy';

function reviewable(overrides: Partial<ReviewableBooking> = {}): ReviewableBooking {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Central',
    courtName: 'Quadra 2',
    dateKey: '2026-04-15',
    startTime: '19:00',
    endTime: '20:30',
    ...overrides,
  };
}

describe('arena-review-copy — constantes', () => {
  it('mantém a mesma recompensa e as mesmas tags do app', () => {
    expect(REVIEW_XP_REWARD).toBe(10);
    expect(REVIEW_HIGHLIGHT_TAGS).toEqual([
      'Quadra impecável', 'Atendimento bom', 'Iluminação', 'Vestiário', 'Pontualidade', 'Estacionamento',
    ]);
    expect(REVIEW_DEFAULT_TAGS).toEqual(['Quadra impecável', 'Atendimento bom']);
  });
});

describe('ratingLabel', () => {
  it('traduz cada nota', () => {
    expect(ratingLabel(1)).toBe('Péssimo');
    expect(ratingLabel(2)).toBe('Ruim');
    expect(ratingLabel(3)).toBe('Regular');
    expect(ratingLabel(4)).toBe('Bom');
    expect(ratingLabel(5)).toBe('Excelente');
  });

  it('devolve vazio fora da faixa', () => {
    expect(ratingLabel(0)).toBe('');
    expect(ratingLabel(9)).toBe('');
  });
});

describe('composeReviewComment', () => {
  it('devolve null sem tag e sem texto', () => {
    expect(composeReviewComment([], '   ')).toBeNull();
  });

  it('lista as tags em ordem alfabética', () => {
    expect(composeReviewComment(['Vestiário', 'Atendimento bom'], '')).toBe('Destaques: Atendimento bom, Vestiário');
  });

  it('devolve só o texto quando não há tag', () => {
    expect(composeReviewComment([], '  Quadra nova, muito boa ')).toBe('Quadra nova, muito boa');
  });

  it('junta destaques e texto em linhas separadas', () => {
    expect(composeReviewComment(['Iluminação'], 'Voltarei')).toBe('Destaques: Iluminação\nVoltarei');
  });
});

describe('reviewSessionSubtitle', () => {
  it('usa HOJE para a reserva do próprio dia', () => {
    expect(reviewSessionSubtitle(reviewable(), new Date(2026, 3, 15, 22, 0))).toBe('HOJE · 19:00-20:30 · QUADRA 2');
  });

  it('usa ONTEM para a véspera', () => {
    expect(reviewSessionSubtitle(reviewable(), new Date(2026, 3, 16, 9, 0))).toBe('ONTEM · 19:00-20:30 · QUADRA 2');
  });

  it('usa dd/MM para datas mais antigas', () => {
    expect(reviewSessionSubtitle(reviewable(), new Date(2026, 3, 20, 9, 0))).toBe('15/04 · 19:00-20:30 · QUADRA 2');
  });

  it('omite o dia quando a data é inutilizável e cai em QUADRA sem nome', () => {
    const sem = reviewable({ dateKey: '', courtName: '  ' });
    expect(reviewSessionSubtitle(sem, new Date(2026, 3, 20, 9, 0))).toBe('19:00-20:30 · QUADRA');
  });
});
