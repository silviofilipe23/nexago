import { statusFromRaw } from './tournaments-repository';

/** `closed` é só "inscrições encerradas" — quem grava é o botão Encerrar inscrições, dias antes do
 *  evento. Tratá-lo como "Em andamento" sem olhar a data fazia torneio adiado (datas empurradas
 *  pra frente, inscrições já fechadas) aparecer rodando semanas antes de acontecer. */
describe('statusFromRaw', () => {
  const now = new Date(2026, 8, 30, 15, 0);

  it('closed com início no futuro: inscrições encerradas, não em andamento', () => {
    expect(statusFromRaw('closed', new Date(2026, 9, 24, 8, 0), now)).toBe('encerradas');
  });

  it('closed no dia do início, mesmo antes da hora marcada: em andamento', () => {
    expect(statusFromRaw('closed', new Date(2026, 8, 30, 18, 0), now)).toBe('andamento');
  });

  it('closed com início já passado: em andamento (conclusão vem da final, não da data)', () => {
    expect(statusFromRaw('closed', new Date(2026, 8, 20, 8, 0), now)).toBe('andamento');
  });

  it('closed sem data de início: mantém em andamento (leitura antiga)', () => {
    expect(statusFromRaw('closed', null, now)).toBe('andamento');
  });

  it('open continua inscrições abertas, qualquer que seja a data', () => {
    expect(statusFromRaw('open', new Date(2026, 9, 24), now)).toBe('inscricoes');
    expect(statusFromRaw('open', new Date(2026, 8, 20), now)).toBe('inscricoes');
  });

  it('terminais não dependem de data', () => {
    expect(statusFromRaw('completed', new Date(2026, 9, 24), now)).toBe('concluido');
    expect(statusFromRaw('cancelled', new Date(2026, 9, 24), now)).toBe('cancelado');
  });
});
