import { BOOKING, COURTS, TIMES, cellState } from './booking-beats';
import {
  AGENDA,
  ARENA_BEATS,
  CLUB,
  TABS,
  TAB_ITEMS,
  TOTAL_HOURS,
  agendaRow,
  barRevenue,
  blocksAt,
  bookingsCount,
  courtRevenue,
  hasTab,
  isYours,
  lastSevenDays,
  occupancy,
  occupiedHours,
  peakTime,
  reached,
  revenue,
  tabTotal,
  type ArenaStep,
} from './arena-beats';

const STEPS = ARENA_BEATS.map((beat) => beat.step);

/** Os horários que um bloco cobre, um por hora ocupada. */
const hoursOf = (block: (typeof AGENDA)[number]) => {
  const start = TIMES.indexOf(block.time);
  return TIMES.slice(start, start + block.hours);
};

describe('cena Arena', () => {
  it('passa por cada passo uma vez, na ordem em que o dia enche', () => {
    expect(STEPS).toEqual(['booking', 'fixed', 'club', 'tab', 'close']);
    expect(reached('fixed', 'club')).toBeFalse();
    expect(reached('close', 'booking')).toBeTrue();
  });

  it('é a mesma arena e o mesmo quadro da cena da reserva: o que lá estava ocupado tem dono aqui', () => {
    const covered = new Set(AGENDA.flatMap((block) => hoursOf(block).map((time) => `${block.court}/${time}`)));
    for (const court of COURTS) {
      for (const time of TIMES) {
        if (cellState('sport', court, time) === 'busy') expect(covered.has(`${court}/${time}`)).toBeTrue();
      }
    }
  });

  it('recebe a reserva feita pelo visitante já no primeiro passo', () => {
    const yours = AGENDA.filter(isYours);
    expect(yours.length).toBe(1);
    expect(yours[0]).toEqual(jasmine.objectContaining({ court: BOOKING.court, time: BOOKING.time, who: 'Você', since: 'booking' }));
    expect(blocksAt('booking').some(isYours)).toBeTrue();
  });

  it('nunca põe dois blocos na mesma quadra ao mesmo tempo, nem fora do quadro', () => {
    const slots = AGENDA.flatMap((block) => hoursOf(block).map((time) => `${block.court}/${time}`));
    expect(new Set(slots).size).toBe(slots.length);
    for (const block of AGENDA) expect(hoursOf(block).length).toBe(block.hours);
  });

  it('monta cada linha da agenda com todos os horários, fundindo o bloco de duas horas', () => {
    for (const step of STEPS) {
      for (const court of COURTS) {
        const columns = agendaRow(step, court).reduce((total, cell) => total + cell.span, 0);
        expect(columns).toBe(TIMES.length);
      }
    }
    expect(agendaRow('fixed', CLUB.court).map((cell) => cell.span)).toEqual([1, 1, 1, 1]);
    const club = agendaRow('club', CLUB.court).find((cell) => cell.block?.kind === 'club');
    expect(club).toEqual(jasmine.objectContaining({ time: CLUB.from, span: 2 }));
  });

  it('destaca só o que entrou na agenda naquele passo', () => {
    const fresh = (step: ArenaStep) => COURTS.flatMap((court) => agendaRow(step, court)).filter((cell) => cell.fresh).length;
    expect(STEPS.map(fresh)).toEqual([4, 3, 2, 0, 0]);
  });

  it('enche a agenda passo a passo e fecha o dia com 83% de ocupação', () => {
    expect(TOTAL_HOURS).toBe(12);
    expect(STEPS.map(occupiedHours)).toEqual([4, 7, 10, 10, 10]);
    expect(STEPS.map(occupancy)).toEqual([33, 58, 83, 83, 83]);
  });

  it('soma ao faturamento o que cada passo traz: o bar só entra quando as comandas fecham', () => {
    expect(STEPS.map(courtRevenue)).toEqual([360, 630, 830, 830, 830]);
    expect(STEPS.map(barRevenue)).toEqual([0, 0, 0, 0, 248]);
    expect(STEPS.map(revenue)).toEqual([360, 630, 830, 830, 1078]);
  });

  it('cobra o clubinho por atleta, e a aula não entra na conta do dia', () => {
    const club = AGENDA.filter((block) => block.kind === 'club');
    expect(club.reduce((total, block) => total + block.value, 0)).toBe(CLUB.spots * CLUB.perAthlete);
    expect(AGENDA.filter((block) => block.kind === 'class').every((block) => block.value === 0)).toBeTrue();
  });

  it('fecha a comanda da cena com a soma dos itens lançados', () => {
    expect(tabTotal()).toBe(37);
    expect(tabTotal(TAB_ITEMS)).toBe(TABS[0].total);
    expect(tabTotal([])).toBe(0);
  });

  it('marca na agenda os horários que têm comanda', () => {
    expect(AGENDA.filter(hasTab).map((block) => block.who)).toEqual(['Você', 'Turma do Leo', CLUB.name]);
  });

  it('resume o dia como o painel: reservas avulsas e fixas, e o horário de pico', () => {
    expect(STEPS.map(bookingsCount)).toEqual([4, 7, 7, 7, 7]);
    expect(peakTime('close')).toBe('18:00');
  });

  it('fecha o gráfico de 7 dias com o faturamento de hoje', () => {
    const days = lastSevenDays();
    expect(days.length).toBe(7);
    expect(days.filter((day) => day.today).map((day) => day.value)).toEqual([revenue('close')]);
    expect(Math.max(...days.map((day) => day.height))).toBe(100);
    expect(days.every((day) => day.height > 0 && day.height <= 100)).toBeTrue();
  });
});
