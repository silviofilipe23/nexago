import {
  ARENA_NAV_GROUPS,
  NAV_ITEMS,
  buildNavSections,
  findActiveId,
  type PanelNavItem,
} from './panel-nav.model';
import {
  ARENA_STAFF_ROLES,
  arenaRoleCanRead,
  type ArenaStaffRole,
} from '../data/arena-roles.model';

/** Espelha a regra de visibilidade do shell, para o teste comparar o agrupado
 *  contra o filtro cru e provar que agrupar não perde nem inventa item. */
function canSeeAs(role: ArenaStaffRole | 'owner'): (item: PanelNavItem) => boolean {
  return (item) => {
    if (item.area == null) return true;
    if (item.area === 'owner') return role === 'owner';
    if (role === 'owner') return true;
    return arenaRoleCanRead(role, item.area);
  };
}

describe('panel-nav.model', () => {
  it('dá um grupo a todo item menos o Início', () => {
    const semGrupo = NAV_ITEMS.filter((i) => i.group == null);
    expect(semGrupo.map((i) => i.id)).toEqual(['inicio']);
  });

  it('não tem grupo declarado sem nenhum item', () => {
    for (const group of ARENA_NAV_GROUPS) {
      expect(NAV_ITEMS.some((i) => i.group === group)).toBe(
        true,
        `grupo '${group}' não tem nenhum item`,
      );
    }
  });

  it('não tem rota nem id repetido', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.route)).size).toBe(NAV_ITEMS.length);
  });

  for (const role of [...ARENA_STAFF_ROLES, 'owner'] as const) {
    it(`para '${role}', agrupar não perde nem inventa item`, () => {
      const canSee = canSeeAs(role);
      const esperado = NAV_ITEMS.filter(canSee).map((i) => i.id);
      const obtido = buildNavSections(NAV_ITEMS, canSee).flatMap((s) => s.items.map((i) => i.id));
      expect(obtido).toEqual(esperado);
    });
  }

  it('descarta seção que ficou sem item para o cargo', () => {
    // manutencao lê quadras, estoque e agenda -- nada de 'conta' nem 'dinheiro'
    const sections = buildNavSections(NAV_ITEMS, canSeeAs('manutencao'));
    expect(sections.map((s) => s.group)).not.toContain('conta');
    expect(sections.map((s) => s.group)).not.toContain('dinheiro');
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it('põe o Início na primeira seção, sem rótulo de grupo', () => {
    const [primeira] = buildNavSections(NAV_ITEMS, canSeeAs('owner'));
    expect(primeira.group).toBeNull();
    expect(primeira.items.map((i) => i.id)).toEqual(['inicio']);
  });

  it('acha a rota ativa por prefixo em rota aninhada', () => {
    expect(findActiveId('/painel')).toBe('inicio');
    expect(findActiveId('/painel/reservas')).toBe('reservas');
    expect(findActiveId('/painel/reservas/abc123')).toBe('reservas');
    expect(findActiveId('/painel/nao-existe')).toBeNull();
  });

  it('acha a rota ativa mesmo quando o cargo não vê o item', () => {
    // 'planos' é owner-only; a detecção varre NAV_ITEMS inteiro de propósito,
    // senão o realce some quando a rota atual está fora do que o cargo vê.
    expect(findActiveId('/painel/planos')).toBe('planos');
  });
});
