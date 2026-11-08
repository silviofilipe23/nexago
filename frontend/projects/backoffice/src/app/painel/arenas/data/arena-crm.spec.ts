import { CRM_STATUSES, crmLabel, effectiveCrmStatus, isCrmStatus, type ArenaCrmEntry } from './arena-crm';

describe('arena-crm', () => {
  const entry = (status: ArenaCrmEntry['status']): ArenaCrmEntry => ({
    status,
    note: null,
    updatedAtMs: null,
    updatedByName: null,
  });

  it('tem os cinco status pedidos, na ordem do funil', () => {
    expect(CRM_STATUSES.map((s) => s.label)).toEqual([
      'Não contatada',
      'Contato realizado',
      'Em negociação',
      'Sem interesse',
      'Cadastrada',
    ]);
  });

  it('sem registro: pré-cadastro é "Não contatada" e arena com conta é "Cadastrada"', () => {
    expect(effectiveCrmStatus(true, undefined)).toBe('not_contacted');
    expect(effectiveCrmStatus(false, undefined)).toBe('registered');
  });

  it('o registro gravado sempre vence o padrão', () => {
    expect(effectiveCrmStatus(true, entry('negotiating'))).toBe('negotiating');
    expect(effectiveCrmStatus(false, entry('contacted'))).toBe('contacted');
  });

  it('só aceita status conhecidos (os mesmos das rules)', () => {
    expect(isCrmStatus('not_interested')).toBeTrue();
    expect(isCrmStatus('lost')).toBeFalse();
    expect(isCrmStatus(null)).toBeFalse();
    expect(crmLabel('registered')).toBe('Cadastrada');
  });
});
