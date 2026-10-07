import { eventoDataOf, eventoDiaSemanaOf, eventoDiasRestantes, eventoDuracaoLabel, eventoLocalLabel, eventoPremiacaoLabel, eventoVagasPct } from './overlay-eventos';

const d = (m: number, day: number, h = 12) => new Date(2026, m - 1, day, h).getTime();

describe('overlay-eventos', () => {
  it('bloco de data: dois dias, um dia, virando o mês', () => {
    expect(eventoDataOf({ startMs: d(10, 24), endMs: d(10, 25) })).toEqual({ dias: '24–25', mes: 'OUT' });
    expect(eventoDataOf({ startMs: d(11, 7), endMs: d(11, 7, 18) })).toEqual({ dias: '07', mes: 'NOV' });
    expect(eventoDataOf({ startMs: d(10, 30), endMs: d(11, 2) })).toEqual({ dias: '30–02', mes: 'OUT–NOV' });
  });

  it('dia da semana e duração', () => {
    expect(eventoDiaSemanaOf({ startMs: d(10, 24) })).toBe('SÁB');
    expect(eventoDuracaoLabel({ startMs: d(10, 24), endMs: d(10, 25) })).toBe('2 dias');
    expect(eventoDuracaoLabel({ startMs: d(11, 7), endMs: d(11, 7) })).toBe('1 dia');
  });

  it('dias restantes pela data de hoje (não pela hora) e nunca negativo', () => {
    expect(eventoDiasRestantes({ startMs: d(10, 24, 8) }, d(10, 7, 23))).toBe(17);
    expect(eventoDiasRestantes({ startMs: d(10, 24) }, d(10, 24, 20))).toBe(0);
    expect(eventoDiasRestantes({ startMs: d(10, 24) }, d(10, 30))).toBe(0);
  });

  it('premiação, vagas e local', () => {
    expect(eventoPremiacaoLabel(2_500_000)).toBe(`R$ ${(25000).toLocaleString('pt-BR')}`);
    expect(eventoPremiacaoLabel(null)).toBeNull();
    expect(eventoPremiacaoLabel(0)).toBeNull();
    expect(eventoVagasPct({ filled: 78, total: 96 })).toBe(81);
    expect(eventoVagasPct({ filled: 120, total: 96 })).toBe(100);
    expect(eventoVagasPct({ filled: null, total: 96 })).toBeNull();
    expect(eventoLocalLabel({ venue: 'Beach Club Jeri', city: 'Jijoca', state: 'CE' })).toBe('Beach Club Jeri · Jijoca · CE');
    expect(eventoLocalLabel({ venue: null, city: 'Fortaleza', state: null })).toBe('Fortaleza');
  });
});
