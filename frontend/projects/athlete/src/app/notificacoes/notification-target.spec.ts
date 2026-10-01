import { notificationTarget } from './notification-target';

describe('notificationTarget', () => {
  it('pedido e lembrete de avaliação abrem o diálogo do torneio', () => {
    for (const type of ['tournament_review_request', 'tournament_review_reminder']) {
      expect(notificationTarget({ type, tournamentId: 't1' })).toEqual({
        commands: ['/torneios', 't1', 'minha-inscricao'],
        queryParams: { avaliar: '1' },
      });
    }
  });

  it('sem tournamentId ou outro tipo: não navega (comportamento de hoje)', () => {
    expect(notificationTarget({ type: 'tournament_review_request', tournamentId: null })).toBeNull();
    expect(notificationTarget({ type: 'tournament_cancelled', tournamentId: 't1' })).toBeNull();
    expect(notificationTarget({ type: null, tournamentId: 't1' })).toBeNull();
  });
});
