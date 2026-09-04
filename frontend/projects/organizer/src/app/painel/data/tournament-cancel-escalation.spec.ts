import { isPaidRegistrationsRejection } from './tournament-cancel-escalation';

describe('isPaidRegistrationsRejection', () => {
  it('reconhece a recusa pelo details.reason', () => {
    expect(isPaidRegistrationsRejection({ details: { reason: 'has_paid_registrations' } })).toBe(true);
  });

  /** Respostas antigas não trazem `details` — só a mensagem. */
  it('reconhece pelo texto quando não há details', () => {
    expect(isPaidRegistrationsRejection(new Error('Há inscrições pagas neste torneio.'))).toBe(true);
    expect(isPaidRegistrationsRejection({ message: 'tournament has paid registrations' })).toBe(true);
  });

  /** Não pode virar "quer forçar?" em falha de rede ou permissão. */
  it('não confunde outras falhas com a recusa', () => {
    expect(isPaidRegistrationsRejection(new Error('Falha de rede'))).toBe(false);
    expect(isPaidRegistrationsRejection({ details: { reason: 'permission-denied' } })).toBe(false);
  });

  it('aguenta erro sem forma nenhuma', () => {
    expect(isPaidRegistrationsRejection(null)).toBe(false);
    expect(isPaidRegistrationsRejection(undefined)).toBe(false);
    expect(isPaidRegistrationsRejection('boom')).toBe(false);
    expect(isPaidRegistrationsRejection({})).toBe(false);
  });
});
