import { statusFrom } from './tournaments.repository';

/** `closed` é só "inscrições encerradas" — pode ser dias antes do evento, e continua assim quando
 *  o torneio é adiado. Mesma regra do portal do organizador (`statusFromRaw`). */
describe('statusFrom', () => {
  const now = new Date(2026, 8, 30, 15, 0);

  it('closed com início no futuro: inscrições encerradas, não em andamento', () => {
    expect(statusFrom('closed', new Date(2026, 9, 24, 8, 0), now)).toBe('encerradas');
  });

  it('closed no dia do início, mesmo antes da hora marcada: em andamento', () => {
    expect(statusFrom('closed', new Date(2026, 8, 30, 18, 0), now)).toBe('andamento');
  });

  it('closed com início já passado: em andamento', () => {
    expect(statusFrom('closed', new Date(2026, 8, 20, 8, 0), now)).toBe('andamento');
  });

  it('closed sem data de início: mantém em andamento (leitura antiga)', () => {
    expect(statusFrom('closed', null, now)).toBe('andamento');
  });

  it('open continua inscrições, qualquer que seja a data', () => {
    expect(statusFrom('open', new Date(2026, 9, 24), now)).toBe('inscricoes');
  });

  it('terminais não dependem de data', () => {
    expect(statusFrom('completed', new Date(2026, 9, 24), now)).toBe('concluido');
    expect(statusFrom('cancelled', new Date(2026, 9, 24), now)).toBe('cancelado');
  });
});
