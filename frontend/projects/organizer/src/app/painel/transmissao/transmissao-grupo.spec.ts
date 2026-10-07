import type { TournamentMatch } from '../data/matches-repository';
import { categoriasComGrupos, gruposDaCategoria } from './transmissao-grupo';

const m = (categoryId: string, round: string | null) => ({ categoryId, round }) as unknown as TournamentMatch;

describe('transmissao-grupo', () => {
  const matches = [m('c1', 'Grupo B'), m('c1', 'Grupo A'), m('c1', 'Grupo A'), m('c1', 'Final'), m('c2', 'Rodada 1'), m('c3', 'Grupo A'), m('c3', null)];

  it('lista as letras dos grupos da categoria, sem repetir e em ordem', () => {
    expect(gruposDaCategoria(matches, 'c1')).toEqual(['A', 'B']);
    expect(gruposDaCategoria(matches, 'c2')).toEqual([]);
  });

  it('só devolve as categorias que têm grupos, na ordem cadastrada', () => {
    const cats = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    expect(categoriasComGrupos(matches, cats)).toEqual([{ id: 'c1' }, { id: 'c3' }]);
    expect(categoriasComGrupos([], cats)).toEqual([]);
  });
});
