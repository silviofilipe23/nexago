import { compactTeamLabel } from './mock-data';

describe('compactTeamLabel', () => {
  it('mantém a dupla inteira quando cada atleta já tem até dois nomes', () => {
    expect(compactTeamLabel('Viana / Natanael Filho')).toBe('Viana / Natanael Filho');
  });

  it('deixa só os dois primeiros nomes do atleta comprido', () => {
    expect(compactTeamLabel('João Pedro Lopes Silva / Ana Carolina Souza Lima')).toBe(
      'João Pedro / Ana Carolina',
    );
  });

  it('encurta os dois lados de forma independente', () => {
    expect(compactTeamLabel('Fernando Machado de Souza / Betim')).toBe('Fernando Machado / Betim');
  });

  it('não mexe em nome custom de equipe (sem " / ")', () => {
    expect(compactTeamLabel('Amigos do Vôlei de Praia')).toBe('Amigos do Vôlei de Praia');
  });

  it('aguenta espaço sobrando entre os nomes', () => {
    expect(compactTeamLabel('  Ana   Paula  Ribeiro /  Rafael  Duarte Nunes ')).toBe(
      'Ana Paula / Rafael Duarte',
    );
  });

  it('funciona pra equipe de três ou mais', () => {
    expect(compactTeamLabel('Ana Paula Ribeiro / Rafael Duarte Nunes / Caio Souza Melo')).toBe(
      'Ana Paula / Rafael Duarte / Caio Souza',
    );
  });

  it('devolve o rótulo de slot indefinido sem inventar corte', () => {
    expect(compactTeamLabel('A definir')).toBe('A definir');
    expect(compactTeamLabel('Vencedor Jogo #1')).toBe('Vencedor Jogo #1');
  });
});
