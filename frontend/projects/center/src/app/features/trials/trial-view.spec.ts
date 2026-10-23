import { applyDecision, countPending, filterTrials, trialErrorMessage, trialWhen, whatsAppLink, type CenterTrialBooking } from './trial-view';

function b(id: string, status: CenterTrialBooking['status'], date: string): CenterTrialBooking {
  return {
    id, status, athleteId: 'u' + id, name: 'Ana Souza', phone: '(62) 99999-0000', photoUrl: null, sessionId: 's', classId: 'k',
    className: 'Kids', level: '', coachName: 'Ju', locationName: 'Sede', date, startTime: '18:00', endTime: '19:30',
    priceReais: 0, note: null, createdAt: null, decidedAt: null, decidedByName: null,
  };
}

describe('trial-view', () => {
  const list = [b('1', 'pending', '2026-10-22'), b('2', 'confirmed', '2026-10-29'), b('3', 'confirmed', '2026-10-15'), b('4', 'declined', '2026-10-30')];

  it('filtra aguardando, próximas e todas', () => {
    expect(filterTrials(list, 'pending', '2026-10-21').map((x) => x.id)).toEqual(['1']);
    expect(filterTrials(list, 'upcoming', '2026-10-21').map((x) => x.id)).toEqual(['1', '2']);
    expect(filterTrials(list, 'all', '2026-10-21').length).toBe(4);
    expect(countPending(list)).toBe(1);
  });

  it('formata o horário com o dia da semana', () => {
    expect(trialWhen(list[0])).toBe('qui 22/10 · 18:00–19:30');
  });

  it('aplica a decisão só no pedido certo', () => {
    const out = applyDecision(list, '1', 'confirmed', 'Recepção', null);
    expect(out[0].status).toBe('confirmed');
    expect(out[0].decidedByName).toBe('Recepção');
    expect(out[1]).toBe(list[1]);
  });

  it('link do WhatsApp com DDI e texto', () => {
    expect(whatsAppLink('(62) 99999-0000', 'oi')).toBe('https://wa.me/5562999990000?text=oi');
    expect(whatsAppLink('+55 62 99999-0000', 'oi')).toBe('https://wa.me/5562999990000?text=oi');
    expect(whatsAppLink(null, 'oi')).toBeNull();
  });

  it('erro de callable não deployada vira texto legível', () => {
    expect(trialErrorMessage(new Error('NOT FOUND'))).toContain('indisponíveis');
  });
});
