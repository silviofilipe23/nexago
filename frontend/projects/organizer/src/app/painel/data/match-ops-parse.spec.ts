import { matchOpsFromRaw } from './tournaments-repository';

/** A cascata de reagendamento é ligada por padrão: torneio antigo, gravado antes do
 *  campo existir, tem de aparecer LIGADO no toggle — senão a tela mente sobre o que o
 *  backend está fazendo. Mesmo padrão `!== false` de `showPublicQr`. */
describe('matchOpsFromRaw · dynamicRescheduleEnabled', () => {
  it('assume ligado quando o doc não tem o campo', () => {
    expect(matchOpsFromRaw({ defaultMatchDurationMin: 45 }).dynamicRescheduleEnabled).toBe(true);
  });

  it('assume ligado quando não há matchOps nenhum', () => {
    expect(matchOpsFromRaw(undefined).dynamicRescheduleEnabled).toBe(true);
  });

  it('respeita o desligamento explícito do organizador', () => {
    expect(matchOpsFromRaw({ dynamicRescheduleEnabled: false }).dynamicRescheduleEnabled).toBe(
      false,
    );
  });

  it('não atropela os outros defaults de matchOps', () => {
    const cfg = matchOpsFromRaw({ dayStart: '08:30' });
    expect(cfg.dayStart).toBe('08:30');
    expect(cfg.dayEnd).toBe('24:00');
    expect(cfg.defaultMatchDurationMin).toBe(30);
    expect(cfg.minRestBetweenMatchesMin).toBe(30);
  });
});
