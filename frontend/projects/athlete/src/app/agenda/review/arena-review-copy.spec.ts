import type { ReviewableBooking } from '../../data/pending-arena-review';
import {
  REVIEW_COMMENT_MAX,
  REVIEW_IMPROVEMENT_TAGS,
  REVIEW_ON_TIME_QUESTION,
  REVIEW_PRAISE_TAGS,
  REVIEW_XP_REWARD,
  composeReviewComment,
  keepReviewTags,
  ratingHint,
  ratingLabel,
  reviewRebookDate,
  reviewRebookLabel,
  reviewRebookSuggestion,
  reviewSentMessage,
  reviewSessionSubtitle,
  reviewTagsFor,
  reviewTagsHeading,
  reviewToneFor,
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
  it('mantém a recompensa e as strings de arena_review_form_logic.dart, na mesma ordem', () => {
    expect(REVIEW_XP_REWARD).toBe(10);
    expect(REVIEW_COMMENT_MAX).toBe(500);
    expect(REVIEW_PRAISE_TAGS).toEqual([
      'Areia fofa e limpa', 'Rede bem armada', 'Iluminação', 'Atendimento', 'Vestiário', 'Bar e água', 'Estacionamento',
    ]);
    expect(REVIEW_IMPROVEMENT_TAGS).toEqual([
      'Areia dura ou com pedras', 'Rede ou antenas', 'Iluminação fraca', 'Atendimento', 'Vestiário', 'Falta de água',
      'Estacionamento',
    ]);
    expect(REVIEW_ON_TIME_QUESTION).toBe('A quadra foi liberada no horário?');
  });

  it('nenhuma lista cabe acima do limite de 10 tags das rules', () => {
    expect(REVIEW_PRAISE_TAGS.length).toBeLessThanOrEqual(10);
    expect(REVIEW_IMPROVEMENT_TAGS.length).toBeLessThanOrEqual(10);
  });
});

describe('tom da nota', () => {
  it('elogia em 4 e 5 e pede melhoria de 1 a 3', () => {
    expect([1, 2, 3, 4, 5].map(reviewToneFor)).toEqual(['improve', 'improve', 'improve', 'praise', 'praise']);
  });

  it('troca as opções e o título pela nota; sem nota, nenhuma opção', () => {
    expect(reviewTagsFor(null)).toEqual([]);
    expect(reviewTagsFor(5)).toBe(REVIEW_PRAISE_TAGS);
    expect(reviewTagsFor(3)).toBe(REVIEW_IMPROVEMENT_TAGS);
    expect(reviewTagsHeading('praise')).toBe('O que se destacou?');
    expect(reviewTagsHeading('improve')).toBe('O que pode melhorar?');
  });
});

describe('keepReviewTags', () => {
  const picked: ReadonlySet<string> = new Set(['Vestiário']);

  it('mantém a seleção no mesmo tom', () => {
    expect(keepReviewTags(picked, 5, 4)).toBe(picked);
    expect(keepReviewTags(picked, 1, 3)).toBe(picked);
  });

  it('zera quando o tom vira, para "Vestiário" não virar "A melhorar: Vestiário" sozinho', () => {
    expect(keepReviewTags(picked, 5, 3).size).toBe(0);
    expect(keepReviewTags(picked, 2, 4).size).toBe(0);
  });

  it('zera na primeira nota', () => {
    expect(keepReviewTags(picked, null, 5).size).toBe(0);
  });
});

describe('ratingLabel e ratingHint', () => {
  it('traduz cada nota', () => {
    expect([1, 2, 3, 4, 5].map(ratingLabel)).toEqual(['Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente']);
  });

  it('devolve vazio fora da faixa ou sem nota', () => {
    expect(ratingLabel(0)).toBe('');
    expect(ratingLabel(9)).toBe('');
    expect(ratingLabel(null)).toBe('');
  });

  it('usa a mesma régua de frases do app', () => {
    expect(ratingHint(1)).toBe('Não dá para voltar');
    expect(ratingHint(2)).toBe('Teve problema que atrapalhou o jogo');
    expect(ratingHint(3)).toBe('Deu para jogar, mas pode melhorar');
    expect(ratingHint(4)).toBe('Jogaria de novo aqui');
    expect(ratingHint(5)).toBe('Quero voltar');
    expect(ratingHint(null)).toBe('Só a nota é obrigatória; o resto é opcional');
  });
});

describe('composeReviewComment', () => {
  it('devolve null sem tag e sem texto', () => {
    expect(composeReviewComment([], '   ')).toBeNull();
  });

  it('lista os destaques em ordem no elogio', () => {
    expect(composeReviewComment(['Vestiário', 'Atendimento'], '', 'praise')).toBe('Destaques: Atendimento, Vestiário');
  });

  it('usa "A melhorar" na nota baixa', () => {
    expect(composeReviewComment(['Iluminação fraca', 'Falta de água'], '', 'improve')).toBe(
      'A melhorar: Falta de água, Iluminação fraca',
    );
  });

  it('devolve só o texto quando não há tag', () => {
    expect(composeReviewComment([], '  Quadra nova, muito boa ', 'improve')).toBe('Quadra nova, muito boa');
  });

  it('junta opções e texto em linhas separadas', () => {
    expect(composeReviewComment(['Iluminação'], 'Voltarei')).toBe('Destaques: Iluminação\nVoltarei');
  });
});

describe('reviewSentMessage', () => {
  it('fala do destaque no elogio e da resposta da arena na nota baixa', () => {
    expect(reviewSentMessage('Arena Central', 5)).toBe('Arena Central vai ver o que se destacou.');
    expect(reviewSentMessage('  ', 2)).toBe(
      'A arena recebe sua nota e o que pode melhorar. A resposta dela aparece no perfil da arena.',
    );
  });
});

describe('Jogar de novo', () => {
  it('cai no mesmo dia da semana, sempre depois de hoje', () => {
    // 15/04/2026 é quarta.
    expect(reviewRebookDate(new Date(2026, 3, 15), new Date(2026, 3, 15, 22, 0))).toEqual(new Date(2026, 3, 22));
    expect(reviewRebookDate(new Date(2026, 3, 15), new Date(2026, 3, 22, 9, 0))).toEqual(new Date(2026, 3, 29));
    expect(reviewRebookDate(new Date(2026, 3, 15), new Date(2026, 4, 2, 9, 0))).toEqual(new Date(2026, 4, 6));
  });

  it('formata "Qua 22/04"', () => {
    expect(reviewRebookLabel(new Date(2026, 3, 22))).toBe('Qua 22/04');
  });

  it('sugere data, horário, quadra e esporte em nota 4–5', () => {
    const booking = reviewable({ courtId: 'c2', sport: 'beach_tennis' });
    expect(reviewRebookSuggestion(booking, 4, new Date(2026, 3, 16, 9, 0))).toEqual({
      when: 'Qua 22/04 · 19:00',
      where: 'Quadra 2 · mesmo horário',
      link: ['/reservar', 'a1', 'agendar'],
      queryParams: { date: '2026-04-22', time: '19:00', courtId: 'c2', sport: 'beach_tennis' },
    });
  });

  it('não sugere em nota 1–3', () => {
    expect(reviewRebookSuggestion(reviewable(), 3, new Date(2026, 3, 16))).toBeNull();
  });

  it('não sugere sem data, horário ou arena utilizáveis', () => {
    const now = new Date(2026, 3, 16);
    expect(reviewRebookSuggestion(reviewable({ dateKey: '' }), 5, now)).toBeNull();
    expect(reviewRebookSuggestion(reviewable({ startTime: '--:--' }), 5, now)).toBeNull();
    expect(reviewRebookSuggestion(reviewable({ arenaId: ' ' }), 5, now)).toBeNull();
  });

  it('deixa a quadra "definida na chegada" fora do link e do texto', () => {
    const booking = reviewable({ courtName: 'Quadra definida na chegada', courtId: 'prov-1' });
    const suggestion = reviewRebookSuggestion(booking, 5, new Date(2026, 3, 16));
    expect(suggestion?.where).toBe('mesmo horário');
    expect(suggestion?.queryParams).toEqual({ date: '2026-04-22', time: '19:00' });
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
