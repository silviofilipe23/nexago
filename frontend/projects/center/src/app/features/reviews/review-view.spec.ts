import {
  appendPage,
  applyReply,
  authorLabel,
  filterReviews,
  formatAverage,
  formatIsoDate,
  formatShortDate,
  isLowScore,
  professorOptions,
  reviewErrorMessage,
  type ManagerReview,
  type ManagerReviewsPage,
} from './review-view';

const review = (id: string, p: Partial<ManagerReview> = {}): ManagerReview => ({
  id,
  anonymous: false,
  athleteName: 'Bia',
  reviewedOn: '2026-10-20',
  date: '2026-10-20',
  startTime: '18:00',
  title: 'Turma iniciante',
  professorName: 'Rui',
  scores: { class: { stars: 5, tags: [] }, professor: { stars: 4, tags: ['Pontual'] }, place: { stars: 5, tags: [] } },
  comment: '',
  ticket: null,
  ...p,
});

const page = (reviews: ManagerReview[], p: Partial<ManagerReviewsPage> = {}): ManagerReviewsPage => ({
  placeName: 'CT Praia',
  rating: 4.6,
  ratingCount: 10,
  averages: { class: 4.5, professor: 4.2, place: null },
  openTickets: reviews.filter((r) => r.ticket?.status === 'open').length,
  total: reviews.length,
  reviews,
  nextCursor: null,
  ...p,
});

const openTicket = { status: 'open' as const, reply: null, repliedAt: null, repliedByName: null };

describe('avaliações do centro', () => {
  it('nota baixa = alguma parte com 2 estrelas ou menos; parte sem nota não conta', () => {
    expect(isLowScore(review('a'))).toBeFalse();
    expect(isLowScore(review('b', { scores: { class: { stars: 5, tags: [] }, professor: null, place: { stars: 2, tags: [] } } }))).toBeTrue();
    expect(isLowScore(review('c', { scores: { class: null, professor: null, place: null } }))).toBeFalse();
    expect(isLowScore(review('d', { scores: { class: { stars: 3, tags: [] }, professor: { stars: 1, tags: [] }, place: null } }))).toBeTrue();
  });

  it('filtra por chamado aberto, nota baixa, comentário e professor, mantendo a ordem', () => {
    const list = [
      review('a', { ticket: openTicket, comment: 'Quadra suja', professorName: 'Ana' }),
      review('b', { scores: { class: { stars: 2, tags: [] }, professor: null, place: null } }),
      review('c', { comment: '   ' }),
      review('d', { ticket: { ...openTicket, status: 'resolved' }, comment: 'Ok' }),
    ];
    expect(filterReviews(list, 'all').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterReviews(list, 'open').map((r) => r.id)).toEqual(['a']);
    expect(filterReviews(list, 'low').map((r) => r.id)).toEqual(['b']);
    expect(filterReviews(list, 'comment').map((r) => r.id)).toEqual(['a', 'd']);
    expect(filterReviews(list, 'all', 'Ana').map((r) => r.id)).toEqual(['a']);
    expect(filterReviews(list, 'low', 'Ana')).toEqual([]);
  });

  it('professores sem repetição, em ordem alfabética, ignorando vazios', () => {
    const list = [review('a', { professorName: 'Rui' }), review('b', { professorName: 'Álvaro' }), review('c', { professorName: '' }), review('d', { professorName: 'Rui' })];
    expect(professorOptions(list)).toEqual(['Álvaro', 'Rui']);
  });

  it('datas: dia da aula em dd/mm e instante em dd/mm no horário de Brasília', () => {
    expect(formatShortDate('2026-10-05')).toBe('05/10');
    expect(formatShortDate('')).toBe('');
    expect(formatIsoDate('2026-10-21T01:30:00.000Z')).toBe('20/10');
    expect(formatIsoDate('2026-10-21T12:00:00.000Z')).toBe('21/10');
    expect(formatIsoDate(null)).toBe('');
    expect(formatIsoDate('lixo')).toBe('');
  });

  it('média com vírgula e traço sem nota', () => {
    expect(formatAverage(4.25)).toBe('4,3');
    expect(formatAverage(5)).toBe('5,0');
    expect(formatAverage(null)).toBe('—');
  });

  it('anônimo não mostra nome nenhum', () => {
    expect(authorLabel(review('a'))).toBe('Bia');
    expect(authorLabel(review('b', { anonymous: true, athleteName: null }))).toBe('Anônimo');
    expect(authorLabel(review('c', { anonymous: true, athleteName: 'Vazou' }))).toBe('Anônimo');
  });

  it('responder troca o item e desconta o chamado só quando estava aberto', () => {
    const a = review('a', { ticket: openTicket });
    const b = review('b', { ticket: { ...openTicket, status: 'answered', reply: 'Oi' } });
    const p = page([a, b]);
    expect(p.openTickets).toBe(1);

    const answered = review('a', { ticket: { status: 'answered', reply: 'Vamos ver', repliedAt: '2026-10-21T12:00:00.000Z', repliedByName: 'Gestor' } });
    const afterA = applyReply(p, a, { status: 'answered', review: answered });
    expect(afterA.reviews[0]).toBe(answered);
    expect(afterA.openTickets).toBe(0);
    expect(p.reviews[0]).toBe(a);

    const resolved = review('b', { ticket: { status: 'resolved', reply: 'Feito', repliedAt: null, repliedByName: 'Gestor' } });
    const afterB = applyReply(afterA, b, { status: 'resolved', review: resolved });
    expect(afterB.reviews[1]).toBe(resolved);
    expect(afterB.openTickets).toBe(0);

    expect(applyReply(p, review('zz'), { status: 'answered', review: answered })).toBe(p);
  });

  it('carregar mais junta a página seguinte sem duplicar e usa o resumo novo', () => {
    const first = page([review('a'), review('b')], { nextCursor: '2' });
    const second = page([review('b'), review('c')], { nextCursor: null, openTickets: 3 });
    const merged = appendPage(first, second);
    expect(merged.reviews.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(merged.nextCursor).toBeNull();
    expect(merged.openTickets).toBe(3);
    expect(appendPage(null, first)).toBe(first);
  });

  it('erro das callables vira texto legível', () => {
    const err = (code: string, message: string) => Object.assign(new Error(message), { code });
    expect(reviewErrorMessage(err('functions/not-found', 'NOT FOUND'))).toContain('indisponíveis');
    expect(reviewErrorMessage(err('functions/not-found', 'Avaliação não encontrada.'))).toBe('Avaliação não encontrada.');
    expect(reviewErrorMessage(err('functions/internal', 'internal'))).toBe('Não foi possível concluir. Tente de novo.');
    expect(reviewErrorMessage(err('functions/unavailable', 'x'))).toBe('Sem conexão. Tente de novo.');
    expect(reviewErrorMessage('?')).toBe('Não foi possível concluir. Tente de novo.');
  });
});
