import {
  AGENDA_GRID_START_MIN,
  AGENDA_ROW_HEIGHT,
  formatMinutes,
  isWithinGrid,
  minutesToRowOffset,
  nowInMinutes,
} from './agenda-grid-math';

describe('agenda-grid-math', () => {
  describe('minutesToRowOffset', () => {
    it('retorna 0 no início da grade (07:00)', () => {
      expect(minutesToRowOffset(AGENDA_GRID_START_MIN)).toBe(0);
    });

    it('avança uma linha por slot de 30min', () => {
      expect(minutesToRowOffset(AGENDA_GRID_START_MIN + 30)).toBe(AGENDA_ROW_HEIGHT);
      expect(minutesToRowOffset(AGENDA_GRID_START_MIN + 90)).toBe(AGENDA_ROW_HEIGHT * 3);
    });
  });

  describe('formatMinutes', () => {
    it('formata como HH:mm com zero à esquerda', () => {
      expect(formatMinutes(9 * 60)).toBe('09:00');
      expect(formatMinutes(11 * 60 + 30)).toBe('11:30');
    });
  });

  describe('isWithinGrid', () => {
    it('é true dentro da janela 07:00–22:00', () => {
      expect(isWithinGrid(9 * 60)).toBe(true);
    });

    it('é false antes das 07:00 ou depois das 22:00', () => {
      expect(isWithinGrid(6 * 60)).toBe(false);
      expect(isWithinGrid(23 * 60)).toBe(false);
    });
  });

  describe('nowInMinutes', () => {
    it('converte horas e minutos de um Date em minutos desde a meia-noite', () => {
      const d = new Date(2026, 0, 1, 14, 45);
      expect(nowInMinutes(d)).toBe(14 * 60 + 45);
    });
  });
});
