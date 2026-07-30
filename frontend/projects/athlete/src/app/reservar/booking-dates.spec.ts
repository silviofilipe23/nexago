import {
  MAX_HORIZON_DAYS,
  STRIP_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  daysBetween,
  findSlotByTime,
  shouldShowMonth,
} from './booking-dates';
import type { ArenaSlot } from '@nexago/arena-discovery';

const TODAY = new Date(2026, 6, 29); // 29/07/2026, quarta

describe('daysBetween', () => {
  it('conta dias de calendário atravessando a virada de mês', () => {
    expect(daysBetween(new Date(2026, 6, 29), new Date(2026, 7, 2))).toBe(4);
  });

  it('é zero no mesmo dia, ignorando a hora', () => {
    expect(daysBetween(new Date(2026, 6, 29, 23, 59), new Date(2026, 6, 29, 0, 1))).toBe(0);
  });

  it('é negativo para datas passadas', () => {
    expect(daysBetween(TODAY, new Date(2026, 6, 28))).toBe(-1);
  });
});

describe('buildDateStrip', () => {
  it('monta 30 chips a partir de hoje quando a seleção está dentro do strip', () => {
    const strip = buildDateStrip(TODAY, TODAY);
    expect(strip.length).toBe(STRIP_DAYS);
    expect(daysBetween(TODAY, strip[0]!)).toBe(0);
    expect(daysBetween(TODAY, strip[STRIP_DAYS - 1]!)).toBe(29);
  });

  it('estende o strip até a data selecionada quando ela passa do dia 30', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, 33));
    expect(strip.length).toBe(34);
    expect(daysBetween(TODAY, strip[strip.length - 1]!)).toBe(33);
  });

  it('respeita o teto de 34 dias de offset (35 chips no máximo)', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, MAX_HORIZON_DAYS));
    expect(strip.length).toBe(MAX_HORIZON_DAYS + 1);
    expect(daysBetween(TODAY, strip[strip.length - 1]!)).toBe(MAX_HORIZON_DAYS);
  });

  it('não estende além do teto mesmo com seleção fora da faixa', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, 400));
    expect(strip.length).toBe(MAX_HORIZON_DAYS + 1);
  });

  it('volta ao tamanho padrão quando a seleção está no passado', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, -5));
    expect(strip.length).toBe(STRIP_DAYS);
  });

  it('atravessa a virada de mês em sequência contínua', () => {
    const strip = buildDateStrip(TODAY, TODAY);
    const dia1 = strip.find((d) => d.getDate() === 1);
    expect(dia1).toBeDefined();
    expect(dia1!.getMonth()).toBe(7); // agosto (0-based)
  });

  it('zera a hora de todas as datas do strip', () => {
    const strip = buildDateStrip(new Date(2026, 6, 29, 22, 45), TODAY);
    expect(strip.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBeTrue();
  });
});

describe('clampPickedDate', () => {
  it('aceita hoje', () => {
    expect(clampPickedDate('2026-07-29', TODAY)).not.toBeNull();
  });

  it('aceita o último dia do horizonte', () => {
    // 29/07/2026 + 34 dias = 01/09/2026
    expect(daysBetween(TODAY, addDays(TODAY, MAX_HORIZON_DAYS))).toBe(MAX_HORIZON_DAYS);
    expect(clampPickedDate('2026-09-01', TODAY)).not.toBeNull();
  });

  it('rejeita um dia além do horizonte', () => {
    expect(clampPickedDate('2026-09-02', TODAY)).toBeNull();
  });

  it('rejeita data no passado', () => {
    expect(clampPickedDate('2026-07-28', TODAY)).toBeNull();
  });

  it('rejeita valor vazio ou malformado', () => {
    expect(clampPickedDate('', TODAY)).toBeNull();
    expect(clampPickedDate('29/07/2026', TODAY)).toBeNull();
    expect(clampPickedDate('2026-13-01', TODAY)).toBeNull();
  });

  it('devolve a data com hora zerada', () => {
    const picked = clampPickedDate('2026-08-05', TODAY);
    expect(picked!.getHours()).toBe(0);
    expect(picked!.getDate()).toBe(5);
    expect(picked!.getMonth()).toBe(7);
  });
});

describe('shouldShowMonth', () => {
  it('mostra o mês no primeiro chip do strip', () => {
    expect(shouldShowMonth(new Date(2026, 6, 29), 0)).toBeTrue();
  });

  it('mostra o mês em todo dia 1º', () => {
    expect(shouldShowMonth(new Date(2026, 7, 1), 3)).toBeTrue();
  });

  it('não mostra o mês nos demais dias', () => {
    expect(shouldShowMonth(new Date(2026, 6, 30), 1)).toBeFalse();
    expect(shouldShowMonth(new Date(2026, 7, 15), 17)).toBeFalse();
  });
});

describe('findSlotByTime', () => {
  function makeSlot(overrides: Partial<ArenaSlot> = {}): ArenaSlot {
    return {
      id: 's1',
      arenaId: 'a1',
      courtId: 'c1',
      date: TODAY,
      startTime: '18:00',
      endTime: '19:00',
      rawStatus: 'available',
      priceReais: 80,
      basePriceReais: 80,
      appliedPromotionId: null,
      isVirtual: false,
      ...overrides,
    };
  }

  it('acha o slot com o horário exato disponível na quadra certa', () => {
    const slot = makeSlot({ id: 's1', courtId: 'c1', startTime: '18:00' });
    const other = makeSlot({ id: 's2', courtId: 'c1', startTime: '19:00' });
    expect(findSlotByTime([slot, other], 'c1', '18:00', TODAY, TODAY)).toBe(slot);
  });

  it('retorna null quando não há slot com esse horário', () => {
    const slot = makeSlot({ startTime: '18:00' });
    expect(findSlotByTime([slot], 'c1', '20:00', TODAY, TODAY)).toBeNull();
  });

  it('ignora slot de outra quadra mesmo com o mesmo horário', () => {
    const slot = makeSlot({ courtId: 'c2', startTime: '18:00' });
    expect(findSlotByTime([slot], 'c1', '18:00', TODAY, TODAY)).toBeNull();
  });

  it('ignora um slot cujo horário já passou', () => {
    const slot = makeSlot({ startTime: '18:00' });
    const now = new Date(2026, 6, 29, 20, 0); // 20h, depois das 18h do mesmo dia
    expect(findSlotByTime([slot], 'c1', '18:00', TODAY, now)).toBeNull();
  });

  it('retorna null quando não há horário pedido', () => {
    const slot = makeSlot({ startTime: '18:00' });
    expect(findSlotByTime([slot], 'c1', null, TODAY, TODAY)).toBeNull();
  });
});
