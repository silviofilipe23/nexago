import { drawBoxLabel, drawFormatLabel, isBoxedDraw } from './draw-session.model';

/** O sorteio ao vivo passou a cobrir King of the Court. A caixa continua sendo
 *  a mesma mecânica (cada dupla cai numa vaga), mas o NOME dela muda: na KOTC
 *  é uma rodada da classificatória, não um grupo — e o telão narra isso na
 *  frente do público. */
describe('sorteio · caixa por formato', () => {
  it('grupos e KOTC distribuem em caixas; dupla eliminatória não', () => {
    expect(isBoxedDraw('groups_knockout')).toBe(true);
    expect(isBoxedDraw('king_of_court')).toBe(true);
    expect(isBoxedDraw('double_elimination')).toBe(false);
  });

  it('na KOTC a caixa é a rodada, pela ordem da letra', () => {
    expect(drawBoxLabel('king_of_court', 'A')).toBe('Rodada 1');
    expect(drawBoxLabel('king_of_court', 'D')).toBe('Rodada 4');
  });

  it('nos outros formatos a caixa segue sendo grupo', () => {
    expect(drawBoxLabel('groups_knockout', 'A')).toBe('Grupo A');
    expect(drawBoxLabel('double_elimination', 'B')).toBe('Grupo B');
  });

  it('id fora do alfabeto cai no próprio id, sem virar rodada negativa', () => {
    // `groupCapacities` só emite letras, mas um doc antigo ou um id inesperado
    // não pode produzir "Rodada -16" no telão.
    expect(drawBoxLabel('king_of_court', '#')).toBe('Rodada #');
  });

  it('cada formato tem nome próprio na tela', () => {
    expect(drawFormatLabel('king_of_court')).toBe('King of the Court');
    expect(drawFormatLabel('groups_knockout')).toBe('Fase de grupos + mata-mata');
    expect(drawFormatLabel('double_elimination')).toBe('Dupla eliminatória');
  });
});
