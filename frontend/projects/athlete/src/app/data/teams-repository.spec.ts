import { roundFullLabel, roundShortLabel } from './teams-repository';

/** Os `matchType` que os geradores de chave realmente gravam
 *  (`functions/src/category-bracket-builders.ts`) — nenhum outro valor chega do backend hoje. */
describe('rótulos de fase (roundShortLabel / roundFullLabel)', () => {
  it('traduz o "knockout" genérico da eliminatória simples', () => {
    // Quartas, oitavas e semifinal chegam TODAS como 'knockout': o gerador só distingue a final.
    // Sem as partidas da categoria não dá pra saber qual delas é, mas o rótulo tem de ser
    // português legível — nunca "KNOCKOUT".
    expect(roundShortLabel('knockout')).toBe('Mata-mata');
    expect(roundFullLabel('knockout')).toBe('Mata-mata');
  });

  it('rotula a final, a disputa de 3º e a fase de grupos', () => {
    expect(roundShortLabel('Final')).toBe('F');
    expect(roundFullLabel('Final')).toBe('Final');
    expect(roundShortLabel('Third Place')).toBe('3º');
    expect(roundFullLabel('Third Place')).toBe('Disputa de 3º lugar');
    expect(roundShortLabel('group')).toBe('Grupos');
    expect(roundFullLabel('group')).toBe('Fase de grupos');
  });

  it('mantém WB/LB como a chave e o Modo Focus já mostram', () => {
    expect(roundShortLabel('WB')).toBe('WB');
    expect(roundFullLabel('WB')).toBe('WB');
    expect(roundShortLabel('LB')).toBe('LB');
    expect(roundFullLabel('LB')).toBe('LB');
  });

  it('não confunde "Round of 32" com disputa de 3º lugar', () => {
    // O "32" casava o teste `includes('3')` da versão anterior e a partida virava "3º".
    expect(roundShortLabel('Round of 32')).toBe('R32');
    expect(roundFullLabel('Round of 32')).toBe('16 avos de final');
    expect(roundShortLabel('Round of 16')).toBe('O16');
    expect(roundFullLabel('Round of 16')).toBe('Oitavas de final');
  });

  it('resolve fases escritas à mão em chaves antigas', () => {
    expect(roundFullLabel('Semi-Final')).toBe('Semifinal');
    expect(roundFullLabel('Quarter-Final')).toBe('Quartas de final');
    expect(roundFullLabel('Bronze Match')).toBe('Disputa de 3º lugar');
    expect(roundFullLabel('Grand Final')).toBe('Grand final');
    // Semifinal e quartas contêm "final": a palavra sozinha não pode ganhar delas.
    expect(roundShortLabel('Semi Final')).toBe('SF');
    expect(roundShortLabel('Quarter Final')).toBe('QF');
  });

  it('cai num fallback neutro quando o matchType não diz nada', () => {
    expect(roundShortLabel('')).toBe('—');
    expect(roundFullLabel('')).toBe('Partida');
    expect(roundShortLabel('coisa nova do backend')).toBe('—');
    expect(roundFullLabel('coisa nova do backend')).toBe('Partida');
  });
});
