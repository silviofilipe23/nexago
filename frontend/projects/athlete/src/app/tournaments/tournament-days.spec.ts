import { eventDayOf } from './tournament-days';

describe('eventDayOf', () => {
  it('não pula pro dia 2 à noite do primeiro dia de um evento de 3 dias', () => {
    // Sáb 08:00 → Seg (qualquer hora): 3 dias corridos. 21h de sábado já são 13h desde o
    // início — a conta ingênua (ms / 24h) arredondaria pra 1 dia inteiro passado.
    const start = new Date(2026, 7, 29, 8, 0);
    const end = new Date(2026, 7, 31, 8, 0);
    const now = new Date(2026, 7, 29, 21, 0);
    expect(eventDayOf(start, end, now)).toEqual({ current: 1, total: 3 });
  });

  it('conta certo no meio de um evento de dois dias', () => {
    // Sáb 08:00 → Dom 20:00: são 2 dias corridos (36h brutas, que a conta ingênua arredondava
    // pra 2 dias inteiros e somava 3 no total).
    const start = new Date(2026, 7, 29, 8, 0);
    const end = new Date(2026, 7, 30, 20, 0);
    const now = new Date(2026, 7, 30, 10, 0);
    expect(eventDayOf(start, end, now)).toEqual({ current: 2, total: 2 });
  });

  it('devolve null para evento de um dia só', () => {
    const start = new Date(2026, 7, 29, 8, 0);
    const end = new Date(2026, 7, 29, 20, 0);
    const now = new Date(2026, 7, 29, 14, 0);
    expect(eventDayOf(start, end, now)).toBeNull();
  });

  it('devolve null com `now` fora da janela do evento', () => {
    const start = new Date(2026, 7, 29, 8, 0);
    const end = new Date(2026, 7, 30, 20, 0);
    expect(eventDayOf(start, end, new Date(2026, 7, 28, 10, 0))).toBeNull(); // antes de começar
    expect(eventDayOf(start, end, new Date(2026, 7, 31, 10, 0))).toBeNull(); // depois de encerrado
  });

  it('devolve null sem início ou fim declarados', () => {
    const now = new Date(2026, 7, 29, 14, 0);
    expect(eventDayOf(null, new Date(2026, 7, 30), now)).toBeNull();
    expect(eventDayOf(new Date(2026, 7, 29), undefined, now)).toBeNull();
  });
});
