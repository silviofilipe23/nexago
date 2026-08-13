import { eventDayOf } from './tournament-days';

/** Horário absoluto independente do fuso da máquina que roda o teste: São Paulo é sempre UTC-3
 *  (Brasil aboliu o horário de verão em 2019, então o deslocamento é fixo o ano inteiro) —
 *  construir via `Date.UTC` evita depender de qual `TZ` o executor local ou de CI usa, ao
 *  contrário de `new Date(ano, mes, dia, ...)`. */
function spLocal(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h + 3, min));
}

describe('eventDayOf', () => {
  it('não pula pro dia 2 à noite do primeiro dia de um evento de 3 dias', () => {
    // Sáb 08:00 → Seg (qualquer hora), por horário de São Paulo: 3 dias corridos. 21h de sábado
    // já são 13h desde o início — a conta ingênua (ms / 24h) arredondaria pra 1 dia inteiro
    // passado. `spLocal`, não `new Date(2026, 7, ...)`: os componentes locais do construtor são
    // do fuso do EXECUTOR do teste, não de São Paulo — nesta sandbox os dois coincidem, mas num
    // runner de CI em outro fuso (Los Angeles, Tóquio, Auckland) o teste passava por acidente
    // com a implementação antiga e falha de verdade com a nova, que sempre lê São Paulo.
    const start = spLocal(2026, 8, 29, 8, 0);
    const end = spLocal(2026, 8, 31, 8, 0);
    const now = spLocal(2026, 8, 29, 21, 0);
    expect(eventDayOf(start, end, now)).toEqual({ current: 1, total: 3 });
  });

  it('conta certo no meio de um evento de dois dias', () => {
    // Sáb 08:00 → Dom 20:00, por horário de São Paulo: são 2 dias corridos (36h brutas, que a
    // conta ingênua arredondava pra 2 dias inteiros e somava 3 no total).
    const start = spLocal(2026, 8, 29, 8, 0);
    const end = spLocal(2026, 8, 30, 20, 0);
    const now = spLocal(2026, 8, 30, 10, 0);
    expect(eventDayOf(start, end, now)).toEqual({ current: 2, total: 2 });
  });

  it('devolve null para evento de um dia só', () => {
    const start = spLocal(2026, 8, 29, 8, 0);
    const end = spLocal(2026, 8, 29, 20, 0);
    const now = spLocal(2026, 8, 29, 14, 0);
    expect(eventDayOf(start, end, now)).toBeNull();
  });

  it('devolve null com `now` fora da janela do evento', () => {
    const start = spLocal(2026, 8, 29, 8, 0);
    const end = spLocal(2026, 8, 30, 20, 0);
    expect(eventDayOf(start, end, spLocal(2026, 8, 28, 10, 0))).toBeNull(); // antes de começar
    expect(eventDayOf(start, end, spLocal(2026, 8, 31, 10, 0))).toBeNull(); // depois de encerrado
  });

  it('devolve null sem início ou fim declarados', () => {
    const now = new Date(2026, 7, 29, 14, 0);
    expect(eventDayOf(null, new Date(2026, 7, 30), now)).toBeNull();
    expect(eventDayOf(new Date(2026, 7, 29), undefined, now)).toBeNull();
  });

  it('conta pelo dia de São Paulo, nunca pelo fuso do dispositivo — o mesmo instante é dias DIFERENTES em São Paulo e em UTC', () => {
    // Evento de 2 dias: Sáb 29/08 a Dom 30/08, por horário de São Paulo (fuso canônico do
    // torneio, igual ao resto do app — nunca o fuso de onde o atleta está fisicamente, nem o
    // fuso da máquina que roda o teste).
    const start = spLocal(2026, 8, 29, 8, 0);
    const end = spLocal(2026, 8, 30, 20, 0);
    // 2026-08-30T02:30:00Z é 29/08 23:30 em São Paulo (UTC-3, ainda dia 1) MAS já 30/08 em UTC
    // — dia diferente nos dois fusos pro MESMO instante, o mesmo fenômeno do exemplo do achado
    // original (23h30 em Manaus já é dia seguinte em São Paulo), só que escolhido pra reproduzir
    // sob `TZ=UTC` — o padrão de runner de CI mais comum — em vez de exigir forçar um fuso
    // exótico feito Manaus só pra desmascarar o bug nesta sandbox (cujo fuso padrão já é São
    // Paulo, o que mascarava a implementação antiga mesmo sem fix).
    const now = new Date('2026-08-30T02:30:00Z');
    expect(eventDayOf(start, end, now)).toEqual({ current: 1, total: 2 });
  });
});
