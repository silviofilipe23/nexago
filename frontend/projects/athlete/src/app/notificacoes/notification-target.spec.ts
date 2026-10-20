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

  it('convite para jogar abre /convite/{id}; avisos da reserva abrem a reserva', () => {
    const base = { tournamentId: null, inviteId: 'b1_ana', bookingId: 'b1' };
    expect(notificationTarget({ ...base, type: 'booking_invite' })).toEqual({ commands: ['/convite', 'b1_ana'] });
    for (const type of ['booking_invite_accepted', 'booking_invite_declined', 'booking_participant_left', 'booking_canceled_participant']) {
      expect(notificationTarget({ ...base, type })).toEqual({ commands: ['/agenda/reserva', 'b1'] });
    }
    expect(notificationTarget({ ...base, type: 'booking_participant_removed' })).toEqual({ commands: ['/agenda'] });
    // Convite legado sem inviteId no payload: não navega.
    expect(notificationTarget({ ...base, inviteId: null, type: 'booking_invite' })).toBeNull();
  });
});
