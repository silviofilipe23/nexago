import { activationGaps, formatDate, matchesFilter, matchesSearch, parseCents, statusPill, type CenterRow } from './training-centers';

function row(p: Partial<CenterRow>): CenterRow {
  return {
    id: 'c', name: 'CT Maré Alta', legalName: 'Maré Alta LTDA', cnpj: '11.222.333/0001-81', city: 'Niterói', state: 'RJ',
    status: 'pending', ownerName: 'Renata', contactEmail: 'r@x.com', contactPhone: '', createdAtMs: null, activatedAtMs: null,
    activationRequestedAtMs: null, suspendedAtMs: null, suspendedReason: '', receivingConnected: false, subscription: null,
    counts: { members: 1, students: 0, activeClasses: 0 }, ...p,
  };
}

describe('training-centers (backoffice)', () => {
  it('pill: pedido de ativação se destaca do pendente comum', () => {
    expect(statusPill(row({})).label).toBe('Pendente');
    expect(statusPill(row({ activationRequestedAtMs: 1 })).tone).toBe('orange');
    expect(statusPill(row({ status: 'suspended' })).tone).toBe('red');
  });

  it('filtros e busca sem acento', () => {
    expect(matchesFilter(row({ activationRequestedAtMs: 1 }), 'requested')).toBeTrue();
    expect(matchesFilter(row({ status: 'active', activationRequestedAtMs: 1 }), 'requested')).toBeFalse();
    expect(matchesSearch(row({}), 'mare')).toBeTrue();
    expect(matchesSearch(row({}), 'niteroi')).toBeTrue();
    expect(matchesSearch(row({}), 'zzz')).toBeFalse();
  });

  it('valor em reais para centavos', () => {
    expect(parseCents('249,90')).toBe(24990);
    expect(parseCents('1.249,90')).toBe(124990);
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNaN();
  });

  it('data no fuso de Brasília', () => {
    expect(formatDate(Date.UTC(2026, 9, 23, 2, 0))).toBe('22 out 2026');
    expect(formatDate(null)).toBe('—');
  });

  it('o que falta para ativar', () => {
    expect(activationGaps(row({}), [])).toEqual([
      'Nenhuma modalidade cadastrada',
      'Conta de recebimento não conectada',
      'Assinatura NexaGO não registrada',
    ]);
    const ready = row({ receivingConnected: true, subscription: { plan: 'Pro', status: 'trial', openInvoiceCents: null, dueDate: null, attempts: null } });
    expect(activationGaps(ready, ['Beach Tennis'])).toEqual([]);
  });
});
