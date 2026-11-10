import {
  contractSummary,
  customerInsight,
  customersCsv,
  followUpLine,
  formatPhone,
  installmentStrip,
  maskedPhone,
  offerMessage,
  patternLabel,
  patternPhrase,
  queueMessage,
  statusLabel,
  whatsappUrl,
  type CrmContractView,
  type CrmCustomer,
} from './crm.model';

function contract(o: Partial<CrmContractView> = {}): CrmContractView {
  return {
    id: 'c1', source: 'contract', customerKey: 'a:u1', planId: null, planName: 'Noite 2x', period: 'monthly', dueDay: 5,
    timesPerWeek: 2, monthlyPriceReais: 260, startDate: '2026-06-05', endDate: '2026-12-04', autoRenew: true, status: 'active',
    paused: false, daysToEnd: 24, nextDueDate: '2026-12-05', overdueCount: 0, overdueReais: 0, daysLate: 0, paidInstallments: 6,
    totalInstallments: null, canceledOn: null, renewedFromId: null, renewedToId: null, note: null, ...o,
  };
}

function customer(o: Partial<CrmCustomer> = {}): CrmCustomer {
  return {
    key: 'a:u1', athleteId: 'u1', name: 'Rafael Moura', photoUrl: null, phone: '(62) 98241-5530', whatsapp: '5562982415530',
    kind: 'member', status: 'active', contract: contract(),
    months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((month) => ({ month, total: 8, plan: 8, avulso: 0, avulsoReais: 0 })),
    bookings6m: 48, avulsoReais6m: 0, firstDate: '2026-06-05', lastVisitDate: '2026-11-09', daysSinceVisit: 1, visitsPerWeek: 2,
    pattern: [{ weekday: 2, startTime: '19:00', weeks: 8 }, { weekday: 4, startTime: '19:00', weeks: 7 }],
    weekHits: Array(8).fill(false), conversion: null, absent: false, lastContact: null, ...o,
  };
}

describe('crm.model', () => {
  it('junta dias do mesmo horário no padrão', () => {
    expect(patternLabel([{ weekday: 1, startTime: '07:00', weeks: 8 }, { weekday: 3, startTime: '07:00', weeks: 8 }])).toBe('Seg e Qua 7h');
    expect(patternLabel([{ weekday: 2, startTime: '19:30', weeks: 5 }, { weekday: 4, startTime: '20:00', weeks: 4 }])).toBe('Ter 19h30 · Qui 20h');
    expect(patternPhrase([{ weekday: 2, startTime: '19:00', weeks: 7 }])).toBe('toda terça às 19h');
  });

  it('formata e esconde o telefone', () => {
    expect(formatPhone('5562982415530')).toBe('(62) 9 8241-5530');
    expect(maskedPhone('(62) 98241-5530')).toBe('(62) 9 8241-••••');
    expect(maskedPhone('123')).toBeNull();
    expect(whatsappUrl('5562982415530', 'Oi, tudo bem?')).toBe('https://wa.me/5562982415530?text=Oi%2C%20tudo%20bem%3F');
  });

  it('resumo do contrato: total, fim do período e parcelas', () => {
    const s = contractSummary('2026-11-15', 'quarterly', 5, 440);
    expect(s.total).toBe(1320);
    expect(s.endDate).toBe('2027-02-14');
    expect(s.installments).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(contractSummary('2026-01-31', 'monthly', 25, 100).endDate).toBe('2026-02-27');
  });

  it('faixa de parcelas marca pagas, atrasadas e a próxima', () => {
    const strip = installmentStrip(contract({ paidInstallments: 4, startDate: '2026-06-05' }), '2026-11-10');
    expect(strip.map((i) => `${i.month}:${i.state}`)).toEqual([
      '2026-08:paid', '2026-09:paid', '2026-10:late', '2026-11:late', '2026-12:open', '2027-01:future',
    ]);
    expect(installmentStrip(contract({ source: 'schedule_plan' }), '2026-11-10')).toEqual([]);
  });

  it('status com o detalhe que importa', () => {
    expect(statusLabel(customer({ status: 'overdue', contract: contract({ status: 'overdue', daysLate: 12 }) }))).toBe('12 dias de atraso');
    expect(statusLabel(customer({ status: 'expiring', contract: contract({ status: 'expiring', daysToEnd: 1 }) }))).toBe('Vencendo · 1 dia');
    expect(statusLabel(customer({ status: 'walk_in', contract: null, conversion: { score: 20, avulso90d: 9, activeWeeks: 7, avgMonthlyReais: 360, suggestion: null } }))).toBe('Pronto pra plano');
  });

  it('mensagens do WhatsApp usam o primeiro nome, o plano e o valor', () => {
    const late = customer({ status: 'overdue', contract: contract({ status: 'overdue', overdueReais: 520 }) });
    expect(queueMessage('overdue', late, { key: late.key, amountReais: 520, contactedRecently: false }, 'Arena CFC')).toContain('Oi, Rafael! Tudo bem? Aqui é da Arena CFC');
    expect(queueMessage('overdue', late, { key: late.key, amountReais: 520, contactedRecently: false }, 'Arena CFC')).toContain('R$ 520');

    const walkIn = customer({
      kind: 'walk_in', status: 'walk_in', contract: null,
      conversion: { score: 20, avulso90d: 9, activeWeeks: 7, avgMonthlyReais: 360, suggestion: { planId: 'p1', planName: 'Noite 1x', monthlyPriceReais: 300, savingsReais: 60 } },
    });
    const offer = offerMessage(walkIn, 'Arena CFC', 'savings');
    expect(offer).toContain('toda terça e quinta às 19h');
    expect(offer).toContain('R$ 300/mês, R$ 60 a menos');
  });

  it('insight: frequência caindo com parcela atrasada', () => {
    const months = [8, 9, 9, 8, 3, 0].map((total, i) => ({ month: `2026-0${i + 4}`, total, plan: total, avulso: 0, avulsoReais: 0 }));
    const c = customer({ months, status: 'overdue', contract: contract({ status: 'overdue' }) });
    expect(customerInsight(c, '2026-11-20')).toContain('Risco alto de sair');
    expect(customerInsight(customer(), '2026-11-20')).toBeNull();
  });

  it('lembrete automático mais novo que o contato humano aparece na fila', () => {
    const contact = { id: 'k', customerKey: 'a:u1', contractId: null, channel: 'whatsapp' as const, reason: 'overdue' as const, outcome: 'no_answer' as const, note: null, at: '2026-11-05T14:00:00.000Z', byName: 'Bruna Lima' };
    expect(followUpLine(customer({ lastContact: contact, lastReminder: { kind: 'overdue_7', sentAt: '2026-11-10T12:00:00.000Z' } }), '2026-11-10')).toBe('Lembrete automático (atraso +7) · hoje');
    expect(followUpLine(customer({ lastContact: contact, lastReminder: { kind: 'due_soon', sentAt: '2026-11-01T12:00:00.000Z' } }), '2026-11-10')).toBe('Sem resposta · há 5 dias, por Bruna');
  });

  it('CSV com separador ; e texto entre aspas quando precisa', () => {
    const csv = customersCsv([customer({ name: 'Moura; Rafael' })]).split('\n');
    expect(csv[0]).toBe('Cliente;Telefone;Status;Plano;Período;Vencimento;Mensal;Frequência/semana;Reservas 6 meses;Último jogo');
    expect(csv[1]).toBe('"Moura; Rafael";(62) 9 8241-5530;Ativo;Noite 2x;Mensal;dia 5;260,00;2;48;09/11/26');
  });
});
