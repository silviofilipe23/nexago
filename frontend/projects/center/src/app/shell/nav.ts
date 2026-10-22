import type { CenterArea } from '../domain/roles';
import type { IconName } from '../ui/icon.component';

export interface NavItem {
  area: CenterArea;
  label: string;
  icon: IconName;
  /** Segmento depois de `/centro/:centerId/`. */
  path: string;
}

/** Sidebar do protótipo (CT_NAV), em três grupos. */
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operação',
    items: [
      { area: 'dashboard', label: 'Dashboard', icon: 'dash', path: 'dashboard' },
      { area: 'schedule', label: 'Agenda', icon: 'calendar', path: 'agenda' },
      { area: 'classes', label: 'Turmas', icon: 'team', path: 'turmas' },
      { area: 'enrollments', label: 'Matrículas', icon: 'clipboard', path: 'matriculas' },
      { area: 'students', label: 'Alunos', icon: 'person', path: 'alunos' },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { area: 'plans', label: 'Planos e pacotes', icon: 'badge', path: 'planos' },
      { area: 'finance', label: 'Financeiro', icon: 'wallet', path: 'financeiro' },
      { area: 'reports', label: 'Relatórios', icon: 'chart', path: 'relatorios' },
    ],
  },
  {
    title: 'Centro',
    items: [
      { area: 'locations', label: 'Locais', icon: 'pin', path: 'locais' },
      { area: 'programs', label: 'Modalidades e níveis', icon: 'flag', path: 'modalidades' },
      { area: 'members', label: 'Equipe', icon: 'users', path: 'equipe' },
      { area: 'settings', label: 'Configurações', icon: 'gear', path: 'configuracoes' },
    ],
  },
];

export const AREA_PATH: Record<CenterArea, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.area, i.path])),
) as Record<CenterArea, string>;
