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
 *  contra o filtro cru e provar que agrupar nao perde nem inventa item. */
function canSeeAs(role: ArenaStaffRole | 'owner'): (item: PanelNavItem) => boolean {
  return (item) => {
    if (item.area == null) return true;
    if (item.area === 'owner') return role === 'owner';
    if (role === 'owner') return true;
    return arenaRoleCanRead(role, item.area);
  };
}

describe('panel-nav.model', () => {
  it('da um grupo a todo item menos o Inicio', () => {
    const semGrupo = NAV_ITEMS.filter((i) => i.group == null);
    expect(semGrupo.map((i) => i.id)).toEqual(['inicio']);
  });

  it('nao tem grupo declarado sem nenhum item', () => {
    for (const group of ARENA_NAV_GROUPS) {
      expect(NAV_ITEMS.some((i) => i.group === group)).toBe(
        true,
        `grupo '${group}' nao tem nenhum item`,
      );
    }
  });

  it('nao tem rota nem id repetido', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.route)).size).toBe(NAV_ITEMS.length);
  });

  for (const role of [...ARENA_STAFF_ROLES, 'owner'] as const) {
    it(`para '${role}', agrupar nao perde nem inventa item`, () => {
      const canSee = canSeeAs(role);
      const esperado = NAV_ITEMS.filter(canSee).map((i) => i.id);
      const obtido = buildNavSections(NAV_ITEMS, canSee).flatMap((s) => s.items.map((i) => i.id));
      expect(obtido).toEqual(esperado);
    });
  }

  it('descarta secao que ficou sem item para o cargo', () => {
    // manutencao le quadras, estoque e agenda -- nada de 'conta' nem 'dinheiro'
    const sections = buildNavSections(NAV_ITEMS, canSeeAs('manutencao'));
    expect(sections.map((s) => s.group)).not.toContain('conta');
    expect(sections.map((s) => s.group)).not.toContain('dinheiro');
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it('poe o Inicio na primeira secao, sem rotulo de grupo', () => {
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

  it('acha a rota ativa mesmo quando o cargo nao ve o item', () => {
    // 'planos' e owner-only; a deteccao varre NAV_ITEMS inteiro de proposito,
    // senao o realce some quando a rota atual esta fora do que o cargo ve.
    expect(findActiveId('/painel/planos')).toBe('planos');
  });
});
