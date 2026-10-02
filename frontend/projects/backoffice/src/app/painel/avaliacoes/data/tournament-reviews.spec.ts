import {
  TOURNAMENT_REVIEW_ASPECTS,
  adminReviewFromData,
  adminReviewRows,
  chunkIds,
  fallbackName,
  formatRating,
  profileNameFromData,
  responseRateLabel,
  reviewWindowLabel,
  reviewsErrorMessage,
  sortSummaries,
  summaryFromData,
  summaryRows,
  type AdminReview,
  type ReviewSummary,
} from './tournament-reviews';

const ts = (d: Date) => ({ toDate: () => d });
const NOW = new Date('2026-10-06T15:00:00Z');

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    organizerId: 'organizer-uid-123456',
    tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
    opensAt: null,
    closesAt: new Date('2026-10-15T13:00:00Z'),
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    ...over,
  };
}

function review(over: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 't1_athlete-uid-000001',
    uid: 'athlete-uid-000001',
    overall: 4,
    aspects: {},
    comment: null,
    createdAt: new Date('2026-10-02T13:00:00Z'),
    updatedAt: new Date('2026-10-02T13:00:00Z'),
    ...over,
  };
}

describe('tournament-reviews (backoffice)', () => {
  it('aspectos na mesma ordem e com os mesmos rótulos de functions/src/tournament-review-constants.ts', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.label)).toEqual([
      'Organização geral',
      'Cumprimento dos horários',
      'Arbitragem / mesa',
      'Estrutura do local',
      'Premiação e kit',
    ]);
  });

  it('summaryFromData lê o resumo do servidor, inclusive o organizador; doc ausente vira null', () => {
    const s = summaryFromData('t1', {
      tournamentId: 't1',
      organizerId: ' organizer-uid-123456 ',
      tournamentName: ' Copa Aurora ',
      tournamentStartAt: ts(new Date('2026-09-26T12:00:00Z')),
      opensAt: ts(new Date('2026-09-28T13:00:00Z')),
      closesAt: ts(new Date('2026-10-12T13:00:00Z')),
      status: 'open',
      eligibleCount: 42,
      count: 2,
      average: null,
    })!;
    expect(s.organizerId).toBe('organizer-uid-123456');
    expect(s.tournamentName).toBe('Copa Aurora');
    expect(s.count).toBe(2);
    expect(s.average).toBeNull();
    expect(s.opensAt).toEqual(new Date('2026-09-28T13:00:00Z'));
    expect(summaryFromData('t1', undefined)).toBeNull();
  });

  it('adminReviewFromData exige uid e nota geral válida; comentário vazio vira null; aspecto desconhecido some', () => {
    const r = adminReviewFromData('t1_u1', {
      tournamentId: 't1',
      uid: 'u1',
      overall: 2,
      aspects: { schedule: 1, bogus: 3, venue: 9 },
      comment: '   ',
      createdAt: ts(new Date('2026-10-02T13:00:00Z')),
      updatedAt: ts(new Date('2026-10-03T12:30:00Z')),
    })!;
    expect(r.uid).toBe('u1');
    expect(r.overall).toBe(2);
    expect(r.aspects).toEqual({ schedule: 1 });
    expect(r.comment).toBeNull();
    expect(adminReviewFromData('x', { overall: 4 })).toBeNull();
    expect(adminReviewFromData('x', { uid: 'u1', overall: 0 })).toBeNull();
  });

  it('nome: nome completo, nome, apelido sem @; sem nada, uid encurtado', () => {
    expect(profileNameFromData({ fullName: ' Ana Paula Souza ', nickname: '@ana' })).toBe('Ana Paula Souza');
    expect(profileNameFromData({ name: 'Ana', nickname: '@ana' })).toBe('Ana');
    expect(profileNameFromData({ nickname: '@ana' })).toBe('ana');
    expect(profileNameFromData({})).toBeNull();
    expect(fallbackName('athlete-uid-000001')).toBe('Sem nome (…000001)');
  });

  it('média com vírgula; resposta sem "0 de 0"; janela pelo prazo, não só pelo status', () => {
    expect(formatRating(4.62)).toBe('4,6');
    expect(responseRateLabel(summary())).toBe('23 de 42');
    expect(responseRateLabel(summary({ count: 0, eligibleCount: 0 }))).toBe('—');
    expect(reviewWindowLabel(summary(), NOW)).toBe('Aberta até 15/10');
    expect(reviewWindowLabel(summary({ closesAt: new Date(NOW.getTime() - 60_000) }), NOW)).toBe('Encerrada');
    expect(reviewWindowLabel(summary({ status: 'closed' }), NOW)).toBe('Encerrada');
  });

  it('mais recentes: pela data de início, ou pela abertura da janela; sem data vai para o fim', () => {
    const list = [
      summary({ tournamentId: 'antigo', tournamentStartAt: new Date('2026-08-01T12:00:00Z') }),
      summary({ tournamentId: 'sem-data', tournamentStartAt: null, opensAt: null }),
      summary({ tournamentId: 'novo', tournamentStartAt: new Date('2026-09-30T12:00:00Z') }),
      summary({ tournamentId: 'so-abertura', tournamentStartAt: null, opensAt: new Date('2026-09-10T13:00:00Z') }),
      summary({ tournamentId: 'sem-data-2', tournamentStartAt: null, opensAt: null }),
    ];
    expect(sortSummaries(list, 'recent').map((s) => s.tournamentId)).toEqual(['novo', 'so-abertura', 'antigo', 'sem-data', 'sem-data-2']);
  });

  it('pior média: só quem tem nota pública na frente, da menor para a maior; empate, mais avaliações antes', () => {
    const list = [
      summary({ tournamentId: 'bom', average: 4.6, count: 23 }),
      summary({ tournamentId: 'ruim-poucas', average: 3.1, count: 10 }),
      summary({ tournamentId: 'sem-nota', average: null, count: 2, tournamentStartAt: new Date('2026-09-30T12:00:00Z') }),
      summary({ tournamentId: 'ruim-muitas', average: 3.1, count: 30 }),
    ];
    expect(sortSummaries(list, 'worst').map((s) => s.tournamentId)).toEqual(['ruim-muitas', 'ruim-poucas', 'bom', 'sem-nota']);
  });

  it('summaryRows monta as células, com — onde não há número e nome de reserva', () => {
    const [row, semNota] = summaryRows(
      [summary(), summary({ tournamentId: 't2', tournamentName: '', organizerId: 'other-org-999999', count: 2, average: null, eligibleCount: 0, status: 'closed' })],
      new Map([['organizer-uid-123456', 'Arena Garden Eventos']]),
      NOW,
    );
    expect(row).toEqual({
      id: 't1',
      name: 'Copa Aurora',
      organizer: 'Arena Garden Eventos',
      date: '26/09/2026',
      average: '4,6',
      reviews: '23',
      response: '23 de 42',
      windowLabel: 'Aberta até 15/10',
      windowOpen: true,
    });
    expect(semNota.name).toBe('Torneio sem nome');
    expect(semNota.organizer).toBe('Sem nome (…999999)');
    expect(semNota.average).toBe('—');
    expect(semNota.response).toBe('—');
    expect(semNota.windowLabel).toBe('Encerrada');
    expect(semNota.windowOpen).toBeFalse();
  });

  it('adminReviewRows: mais nova primeiro, nome do atleta, estrelas, aspectos e marca de edição', () => {
    const rows = adminReviewRows(
      [
        review(),
        review({
          id: 't1_athlete-uid-000002',
          uid: 'athlete-uid-000002',
          overall: 2,
          aspects: { prizes: 1, organization: 3 },
          comment: 'Premiação não foi entregue.',
          createdAt: new Date('2026-10-03T12:00:00Z'),
          updatedAt: new Date('2026-10-04T12:30:00Z'),
        }),
      ],
      new Map([['athlete-uid-000002', 'Bruna Lima']]),
    );
    expect(rows.map((r) => r.athlete)).toEqual(['Bruna Lima', 'Sem nome (…000001)']);
    expect(rows[0]).toEqual({
      id: 't1_athlete-uid-000002',
      athlete: 'Bruna Lima',
      overall: 2,
      stars: '★★☆☆☆',
      aspects: ['Organização geral 3★', 'Premiação e kit 1★'],
      comment: 'Premiação não foi entregue.',
      sentAt: 'Enviada em 03/10/2026 09:00 · editada em 04/10/2026 09:30',
    });
    expect(rows[1].sentAt).toBe('Enviada em 02/10/2026 10:00');
    expect(rows[1].aspects).toEqual([]);
    expect(rows[1].comment).toBeNull();
  });

  it('chunkIds: sem repetidos nem vazios, em lotes de 30', () => {
    const ids = Array.from({ length: 61 }, (_, i) => `u${i}`);
    expect(chunkIds([...ids, 'u0', '', ' ']).map((c) => c.length)).toEqual([30, 30, 1]);
  });

  it('mensagem de erro: sem permissão explica o papel admin', () => {
    expect(reviewsErrorMessage({ code: 'permission-denied' })).toBe('Sem permissão para ler as avaliações. A tela precisa do papel admin.');
    expect(reviewsErrorMessage(new Error('offline'))).toBe('offline');
    expect(reviewsErrorMessage('x')).toBe('Falha ao ler as avaliações.');
  });
});
