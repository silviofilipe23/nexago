import { datetimeToInput, inputToDatetime } from './criar-etapa.component';

describe('criar-etapa datetime helpers (janela de inscrição)', () => {
  describe('datetimeToInput', () => {
    it('formata data e hora no formato aceito por <input type="datetime-local">', () => {
      expect(datetimeToInput(new Date(2026, 2, 1, 9, 5))).toBe('2026-03-01T09:05');
    });

    it('retorna string vazia para null', () => {
      expect(datetimeToInput(null)).toBe('');
    });
  });

  describe('inputToDatetime', () => {
    it('faz o round-trip com datetimeToInput preservando data e hora', () => {
      const original = new Date(2026, 3, 15, 23, 59);
      expect(inputToDatetime(datetimeToInput(original))).toEqual(original);
    });

    it('retorna null para string vazia', () => {
      expect(inputToDatetime('')).toBeNull();
    });
  });
});
