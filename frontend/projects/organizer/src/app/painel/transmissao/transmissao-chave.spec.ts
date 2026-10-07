import type { TournamentMatch } from '../data/matches-repository';
import { categoriasComChave } from './transmissao-chave';

const m = (categoryId: string, matchType: string, round: string | null = null) => ({ categoryId, matchType, round }) as unknown as TournamentMatch;

describe('transmissao-chave', () => {
  const cats = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }];

  it('só devolve categorias com partidas de chave, na ordem cadastrada', () => {
    const matches = [m('c3', 'knockout'), m('c1', ' Final '), m('c2', 'group', 'Grupo A'), m('c4', 'koc_pool'), m('c5', 'LB')];
    expect(categoriasComChave(matches, cats)).toEqual([{ id: 'c1' }, { id: 'c3' }, { id: 'c5' }]);
  });

  it('partida de grupo (por tipo ou round) e sem tipo não contam', () => {
    const matches = [m('c1', 'knockout', 'Grupo B'), m('c2', ''), m('c3', 'GROUP')];
    expect(categoriasComChave(matches, cats)).toEqual([]);
    expect(categoriasComChave([], cats)).toEqual([]);
  });

  it('reconhece dupla eliminatória e disputa de 3º', () => {
    const matches = [m('c1', 'WB'), m('c2', 'Third Place')];
    expect(categoriasComChave(matches, cats)).toEqual([{ id: 'c1' }, { id: 'c2' }]);
  });
});
