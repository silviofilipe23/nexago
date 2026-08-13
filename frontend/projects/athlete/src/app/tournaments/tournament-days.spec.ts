import { eventDayOf } from './tournament-days';

/** Horários absolutos independentes do fuso da máquina que roda o teste: São Paulo é sempre
 *  UTC-3 e Manaus é sempre UTC-4 (Brasil aboliu o horário de verão em 2019, então os dois
 *  deslocamentos são fixos o ano inteiro) — construir via `Date.UTC` evita depender de qual
 *  `TZ` o executor local ou de CI usa, ao contrário de `new Date(ano, mes, dia, ...)`. */
function spLocal(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h + 3, min));
}
function manausLocal(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h + 4, min));
}

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

  it('conta pelo dia de São Paulo, nunca pelo fuso do dispositivo — 23:30 em Manaus já é 00:30 (dia seguinte) em São Paulo', () => {
    // Evento de 2 dias: Sáb 29/08 a Dom 30/08, por horário de São Paulo (fuso canônico do
    // torneio, igual ao resto do app — nunca o fuso de onde o atleta está fisicamente).
    const start = spLocal(2026, 8, 29, 8, 0);
    const end = spLocal(2026, 8, 30, 20, 0);
    // 29/08 23:30 em Manaus (UTC-4) é exatamente 30/08 00:30 em São Paulo (UTC-3) — o dia já
    // virou em SP, mesmo que o dispositivo de um atleta em Manaus ainda marque dia 29.
    const now = manausLocal(2026, 8, 29, 23, 30);
    expect(eventDayOf(start, end, now)).toEqual({ current: 2, total: 2 });
  });
});
