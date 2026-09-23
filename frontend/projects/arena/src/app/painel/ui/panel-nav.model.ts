import type { ArenaArea } from '../data/arena-roles.model';
import type { PanelIconName } from './icon.component';

export const ARENA_NAV_GROUPS = ['operacao', 'vendas', 'dinheiro', 'publico', 'conta'] as const;
export type ArenaNavGroup = (typeof ARENA_NAV_GROUPS)[number];

export const ARENA_NAV_GROUP_LABEL: Record<ArenaNavGroup, string> = {
  operacao: 'Operação',
  vendas: 'Vendas',
  dinheiro: 'Dinheiro',
  publico: 'Público',
  conta: 'Conta',
};

export interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge: number | null;
  /** Área exigida; `null` = visível a todos; `'owner'` = só o dono. */
  area: ArenaArea | 'owner' | null;
  /** `null` = fica solto no topo, fora de grupo (só o Início). */
  group: ArenaNavGroup | null;
}

export const NAV_ITEMS: readonly PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel', badge: null, area: null, group: null },

  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'reservas', label: 'Reservas', icon: 'clock', route: '/painel/reservas', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'horarios-fixos', label: 'Horários fixos', icon: 'repeat', route: '/painel/horarios-fixos', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'clubinho', label: 'Clubinho', icon: 'users', route: '/painel/clubinho', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'quadras', label: 'Quadras', icon: 'courts', route: '/painel/quadras', badge: null, area: 'quadras', group: 'operacao' },

  { id: 'comandas', label: 'Comandas', icon: 'bookmark', route: '/painel/comandas', badge: null, area: 'comandas', group: 'vendas' },
  { id: 'estoque', label: 'Estoque', icon: 'box', route: '/painel/estoque', badge: null, area: 'estoque', group: 'vendas' },
  { id: 'promocoes', label: 'Promoções', icon: 'tag', route: '/painel/promocoes', badge: null, area: 'promocoes', group: 'vendas' },
  { id: 'cupons', label: 'Cupons', icon: 'tag', route: '/painel/cupons', badge: null, area: 'promocoes', group: 'vendas' },
  { id: 'horarios-pico', label: 'Horários de pico', icon: 'tag', route: '/painel/horarios-pico', badge: null, area: 'promocoes', group: 'vendas' },

  { id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro', badge: null, area: 'financeiro', group: 'dinheiro' },
  { id: 'ocupacao', label: 'Ocupação', icon: 'chart-bar', route: '/painel/relatorios/ocupacao', badge: null, area: 'financeiro', group: 'dinheiro' },

  { id: 'meu-site', label: 'Meu site', icon: 'image', route: '/painel/meu-site', badge: null, area: 'site', group: 'publico' },
  { id: 'links', label: 'Links', icon: 'share', route: '/painel/links', badge: null, area: 'site', group: 'publico' },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'star', route: '/painel/avaliacoes', badge: null, area: 'comunidade', group: 'publico' },
  { id: 'seguidores', label: 'Seguidores', icon: 'users', route: '/painel/seguidores', badge: null, area: 'comunidade', group: 'publico' },
  { id: 'ranking', label: 'Ranking', icon: 'ranking', route: '/painel/ranking', badge: null, area: 'comunidade', group: 'publico' },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios', badge: 2, area: 'torneios', group: 'publico' },

  { id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe', badge: null, area: 'owner', group: 'conta' },
  { id: 'planos', label: 'Planos', icon: 'card', route: '/painel/planos', badge: null, area: 'owner', group: 'conta' },
];

export interface PanelNavSection {
  group: ArenaNavGroup | null;
  label: string;
  items: PanelNavItem[];
}

/** Agrupa os itens visíveis preservando a ordem de `NAV_ITEMS` e descartando
 *  seção que ficou vazia para o cargo. Não decide permissão: quem decide é o
 *  `canSee` que vem de fora. */
export function buildNavSections(
  items: readonly PanelNavItem[],
  canSee: (item: PanelNavItem) => boolean,
): PanelNavSection[] {
  const sections: PanelNavSection[] = [];
  const byGroup = new Map<ArenaNavGroup | null, PanelNavSection>();

  for (const item of items) {
    if (!canSee(item)) continue;
    let section = byGroup.get(item.group);
    if (!section) {
      section = {
        group: item.group,
        label: item.group == null ? '' : ARENA_NAV_GROUP_LABEL[item.group],
        items: [],
      };
      byGroup.set(item.group, section);
      sections.push(section);
    }
    section.items.push(item);
  }

  return sections;
}

/** Detecção de rota ativa. Varre `NAV_ITEMS` INTEIRO de propósito — não a lista
 *  filtrada nem a agrupada. Se varresse só o que o cargo vê, o realce sumiria
 *  quando a rota atual está fora do alcance dele. */
export function findActiveId(path: string): string | null {
  const exact = NAV_ITEMS.find((item) => item.route === path);
  if (exact) return exact.id;
  const nested = NAV_ITEMS.find(
    (item) => item.route !== '/painel' && path.startsWith(item.route + '/'),
  );
  return nested?.id ?? null;
}
