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

  it('mensalidade de aula abre a fatura em nova aba; sem link, a Agenda', () => {
    const base = { type: 'arena_class_charge_link', tournamentId: null };
    expect(notificationTarget({ ...base, invoiceUrl: 'https://www.asaas.com/i/abc123' })).toEqual({
      externalUrl: 'https://www.asaas.com/i/abc123',
    });
    expect(notificationTarget({ ...base, invoiceUrl: null })).toEqual({ commands: ['/agenda'] });
    expect(notificationTarget({ ...base, invoiceUrl: 'javascript:alert(1)' })).toEqual({ commands: ['/agenda'] });
  });

  it('avisos do vínculo de professor abrem o vínculo (ou Minhas arenas sem linkId)', () => {
    for (const type of ['professor_link_invite', 'professor_link_approved', 'professor_link_suspended']) {
      expect(notificationTarget({ type, tournamentId: null, linkId: 'a1_u1' })).toEqual({
        commands: ['/professor/arenas', 'a1_u1'],
      });
    }
    expect(notificationTarget({ type: 'professor_link_ended', tournamentId: null, linkId: null })).toEqual({
      commands: ['/professor/arenas'],
    });
    // O lado da arena (`arena_professor_*`) é do painel da arena, não do portal do atleta.
    expect(notificationTarget({ type: 'arena_professor_request', tournamentId: null, linkId: 'a1_u1' })).toBeNull();
  });
  it('cobrança do centro abre a fatura do centro no portal; sem id, as Mensalidades', () => {
    expect(
      notificationTarget({ type: 'training_center_billing_notice', tournamentId: null, centerId: 'c1', invoiceId: 'sub_e1_2026-11' }),
    ).toEqual({ commands: ['/mensalidades/centro', 'c1', 'sub_e1_2026-11'] });
    expect(notificationTarget({ type: 'training_center_invoice_link', tournamentId: null })).toEqual({ commands: ['/mensalidades'] });
  });
});
