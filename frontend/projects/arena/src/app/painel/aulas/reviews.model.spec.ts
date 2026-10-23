import {
  applyReply,
  filterReviews,
  formatAverage,
  isLowScore,
  professorOptions,
  replyError,
  reviewerLabel,
  shortDate,
  shortDateFromIso,
  type ManagerReview,
} from './reviews.model';

function review(over: Partial<ManagerReview> = {}): ManagerReview {
  return {
    id: 'r1',
    anonymous: false,
    athleteName: 'Ana',
    reviewedOn: '2026-10-20',
    date: '2026-10-19',
    startTime: '18:00',
    title: 'Turma iniciante',
    professorName: 'Bruno',
    scores: { class: { stars: 5, tags: [] }, professor: { stars: 4, tags: ['Didático'] }, place: null },
    comment: '',
    ticket: null,
    ...over,
  };
}

describe('avaliações de aulas (reviews.model)', () => {
  it('nota baixa = alguma parte com 2 estrelas ou menos', () => {
    expect(isLowScore(review())).toBeFalse();
    expect(isLowScore(review({ scores: { class: null, professor: null, place: { stars: 2, tags: [] } } }))).toBeTrue();
    expect(isLowScore(review({ scores: { class: null, professor: null, place: null } }))).toBeFalse();
  });

  it('filtra por chamado, nota, comentário e professor', () => {
    const open = review({ id: 'a', ticket: { status: 'open', reply: null, repliedAt: null, repliedByName: null } });
    const low = review({ id: 'b', professorName: 'Carla', scores: { class: { stars: 1, tags: [] }, professor: null, place: null } });
    const commented = review({ id: 'c', comment: ' Ótima aula ' });
    const all = [open, low, commented];
    expect(filterReviews(all, 'all').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterReviews(all, 'open').map((r) => r.id)).toEqual(['a']);
    expect(filterReviews(all, 'low').map((r) => r.id)).toEqual(['b']);
    expect(filterReviews(all, 'comment').map((r) => r.id)).toEqual(['c']);
    expect(filterReviews(all, 'all', 'Carla').map((r) => r.id)).toEqual(['b']);
    expect(filterReviews(all, 'open', 'Carla')).toEqual([]);
  });

  it('lista professores distintos em ordem', () => {
    expect(professorOptions([review({ professorName: 'Zé' }), review({ professorName: 'Álvaro' }), review({ professorName: 'Zé' }), review({ professorName: ' ' })])).toEqual([
      'Álvaro',
      'Zé',
    ]);
  });

  it('formata datas e médias', () => {
    expect(shortDate('2026-10-19')).toBe('19/10');
    expect(shortDate('lixo')).toBe('lixo');
    expect(shortDate(null)).toBe('');
    expect(shortDateFromIso('2026-10-20T02:00:00.000Z')).toBe('19/10');
    expect(shortDateFromIso('x')).toBe('');
    expect(formatAverage(4.46)).toBe('4,5');
    expect(formatAverage(null)).toBe('—');
  });

  it('anônima nunca mostra nome', () => {
    expect(reviewerLabel(review({ anonymous: true, athleteName: 'Ana' }))).toBe('Anônimo');
    expect(reviewerLabel(review())).toBe('Ana');
    expect(reviewerLabel(review({ athleteName: null }))).toBe('Aluno');
  });

  it('applyReply troca o item e desconta chamado aberto', () => {
    const open = review({ id: 'a', ticket: { status: 'open', reply: null, repliedAt: null, repliedByName: null } });
    const other = review({ id: 'b' });
    const answered = review({ id: 'a', ticket: { status: 'answered', reply: 'Obrigado', repliedAt: '2026-10-20T12:00:00Z', repliedByName: 'Gestor' } });
    const out = applyReply([open, other], 3, answered);
    expect(out.reviews[0]).toBe(answered);
    expect(out.reviews[1]).toBe(other);
    expect(out.openTickets).toBe(2);

    const resolved = review({ id: 'a', ticket: { ...answered.ticket!, status: 'resolved' } });
    expect(applyReply(out.reviews, 2, resolved).openTickets).toBe(2);
    expect(applyReply([open], 0, answered).openTickets).toBe(0);
    expect(applyReply([other], 1, answered)).toEqual({ reviews: [other], openTickets: 1 });
  });

  it('valida a resposta', () => {
    expect(replyError('  ')).toBe('Escreva a resposta.');
    expect(replyError('x'.repeat(601))).toContain('600');
    expect(replyError('Valeu!')).toBeNull();
  });
});
