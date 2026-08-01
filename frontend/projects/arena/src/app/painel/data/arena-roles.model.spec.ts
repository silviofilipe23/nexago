import {
  ARENA_AREAS,
  ARENA_ROLE_LABEL,
  ARENA_STAFF_ROLES,
  arenaRoleCanRead,
  arenaRoleCanWrite,
} from './arena-roles.model';

describe('arena-roles.model', () => {
  it('gestor escreve em tudo menos financeiro e torneios', () => {
    expect(arenaRoleCanWrite('gestor', 'agenda')).toBe(true);
    expect(arenaRoleCanWrite('gestor', 'perfil')).toBe(true);
    expect(arenaRoleCanWrite('gestor', 'site')).toBe(true);
    expect(arenaRoleCanWrite('gestor', 'financeiro')).toBe(false);
    expect(arenaRoleCanWrite('gestor', 'torneios')).toBe(false);
  });

  it('gestor le financeiro e torneios', () => {
    expect(arenaRoleCanRead('gestor', 'financeiro')).toBe(true);
    expect(arenaRoleCanRead('gestor', 'torneios')).toBe(true);
  });

  it('recepcao escreve agenda e comandas, le estoque, nao ve financeiro', () => {
    expect(arenaRoleCanWrite('recepcao', 'agenda')).toBe(true);
    expect(arenaRoleCanWrite('recepcao', 'comandas')).toBe(true);
    expect(arenaRoleCanWrite('recepcao', 'estoque')).toBe(false);
    expect(arenaRoleCanRead('recepcao', 'estoque')).toBe(true);
    expect(arenaRoleCanRead('recepcao', 'financeiro')).toBe(false);
  });

  it('financeiro nao alcanca agenda nem perfil', () => {
    expect(arenaRoleCanRead('financeiro', 'financeiro')).toBe(true);
    expect(arenaRoleCanWrite('financeiro', 'financeiro')).toBe(false);
    expect(arenaRoleCanWrite('financeiro', 'promocoes')).toBe(true);
    expect(arenaRoleCanRead('financeiro', 'comandas')).toBe(true);
    expect(arenaRoleCanWrite('financeiro', 'comandas')).toBe(false);
    expect(arenaRoleCanRead('financeiro', 'agenda')).toBe(false);
    expect(arenaRoleCanRead('financeiro', 'perfil')).toBe(false);
  });

  it('manutencao escreve quadras e estoque, le agenda', () => {
    expect(arenaRoleCanWrite('manutencao', 'quadras')).toBe(true);
    expect(arenaRoleCanWrite('manutencao', 'estoque')).toBe(true);
    expect(arenaRoleCanRead('manutencao', 'agenda')).toBe(true);
    expect(arenaRoleCanWrite('manutencao', 'agenda')).toBe(false);
    expect(arenaRoleCanRead('manutencao', 'financeiro')).toBe(false);
    expect(arenaRoleCanRead('manutencao', 'comandas')).toBe(false);
  });

  it('escrita sempre implica leitura', () => {
    for (const role of ARENA_STAFF_ROLES) {
      for (const area of ARENA_AREAS) {
        if (arenaRoleCanWrite(role, area)) {
          expect(arenaRoleCanRead(role, area))
            .withContext(`${role} escreve ${area} mas nao le`)
            .toBe(true);
        }
      }
    }
  });

  it('cargo desconhecido nao alcanca nada', () => {
    for (const area of ARENA_AREAS) {
      expect(arenaRoleCanRead('sindico' as never, area)).toBe(false);
      expect(arenaRoleCanWrite('sindico' as never, area)).toBe(false);
    }
  });

  it('todo cargo tem rotulo', () => {
    for (const role of ARENA_STAFF_ROLES) {
      expect(ARENA_ROLE_LABEL[role].length).toBeGreaterThan(0);
    }
  });

  it('matriz completa: cada cargo em cada area', () => {
    const EXPECTED: Record<string, Record<string, 'RW' | 'R' | '-'>> = {
      gestor: {
        agenda: 'RW',
        comandas: 'RW',
        estoque: 'RW',
        financeiro: 'R',
        promocoes: 'RW',
        site: 'RW',
        quadras: 'RW',
        perfil: 'RW',
        torneios: 'R',
        comunidade: 'RW',
      },
      recepcao: {
        agenda: 'RW',
        comandas: 'RW',
        estoque: 'R',
        financeiro: '-',
        promocoes: '-',
        site: '-',
        quadras: '-',
        perfil: '-',
        torneios: '-',
        comunidade: 'R',
      },
      financeiro: {
        agenda: '-',
        comandas: 'R',
        estoque: '-',
        financeiro: 'R',
        promocoes: 'RW',
        site: '-',
        quadras: '-',
        perfil: '-',
        torneios: '-',
        comunidade: 'R',
      },
      manutencao: {
        agenda: 'R',
        comandas: '-',
        estoque: 'RW',
        financeiro: '-',
        promocoes: '-',
        site: '-',
        quadras: 'RW',
        perfil: '-',
        torneios: '-',
        comunidade: '-',
      },
    };

    for (const role of ARENA_STAFF_ROLES) {
      for (const area of ARENA_AREAS) {
        const expected = EXPECTED[role][area];
        expect(arenaRoleCanWrite(role, area))
          .withContext(`${role} escreve ${area}`)
          .toBe(expected === 'RW');
        expect(arenaRoleCanRead(role, area))
          .withContext(`${role} le ${area}`)
          .toBe(expected !== '-');
      }
    }
  });
});
