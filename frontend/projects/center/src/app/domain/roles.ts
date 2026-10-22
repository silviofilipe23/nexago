/**
 * Papéis e permissões por centro. Uma conta NexaGO pode ter vínculo com vários centros, cada um
 * com papel próprio (`trainingCenters/{id}/centerMembers/{uid}`). Isto aqui decide o que a UI
 * mostra; quem autoriza de verdade são as rules (`firestore.rules`, bloco "Centro de
 * Treinamento"), que espelham os mesmos papéis e as permissões extras que importam pra dados.
 */

export type CenterRole = 'center_owner' | 'center_admin' | 'coach' | 'receptionist';
export type MemberStatus = 'active' | 'invited' | 'revoked';

export const ROLE_LABELS: Record<CenterRole, string> = {
  center_owner: 'Owner',
  center_admin: 'Admin',
  coach: 'Professor',
  receptionist: 'Recepção',
};

/** Áreas do painel (uma por item da sidebar). */
export type CenterArea =
  | 'dashboard'
  | 'schedule'
  | 'classes'
  | 'enrollments'
  | 'students'
  | 'plans'
  | 'finance'
  | 'reports'
  | 'locations'
  | 'programs'
  | 'members'
  | 'settings';

export const AREA_LABELS: Record<CenterArea, string> = {
  dashboard: 'Dashboard',
  schedule: 'Agenda',
  classes: 'Turmas',
  enrollments: 'Matrículas',
  students: 'Alunos',
  plans: 'Planos e pacotes',
  finance: 'Financeiro',
  reports: 'Relatórios',
  locations: 'Locais',
  programs: 'Modalidades e níveis',
  members: 'Equipe',
  settings: 'Configurações',
};

/**
 * Permissões que o owner/admin liga ou desliga por pessoa (tela Equipe). As duas primeiras são o
 * padrão do professor; as outras são "extras".
 */
export type CenterPermission =
  | 'edit_classes'
  | 'attendance'
  | 'view_enrollments'
  | 'enroll_students'
  | 'view_finance'
  | 'edit_plans'
  | 'center_settings';

export const PERMISSION_LABELS: Record<CenterPermission, string> = {
  edit_classes: 'Ver e editar turmas atribuídas',
  attendance: 'Registrar e corrigir chamada',
  view_enrollments: 'Ver matrículas das suas turmas',
  enroll_students: 'Matricular alunos',
  view_finance: 'Ver cobranças e pagamentos',
  edit_plans: 'Editar planos e preços',
  center_settings: 'Configurações do centro',
};

export const PERMISSION_ORDER: CenterPermission[] = [
  'edit_classes',
  'attendance',
  'view_enrollments',
  'enroll_students',
  'view_finance',
  'edit_plans',
  'center_settings',
];

/** O que cada papel tem sem precisar de permissão extra. */
export const ROLE_DEFAULT_PERMISSIONS: Record<CenterRole, CenterPermission[]> = {
  center_owner: [...PERMISSION_ORDER],
  center_admin: [...PERMISSION_ORDER],
  receptionist: ['view_enrollments', 'enroll_students'],
  coach: ['edit_classes', 'attendance'],
};

const ROLE_AREAS: Record<CenterRole, CenterArea[]> = {
  center_owner: [
    'dashboard',
    'schedule',
    'classes',
    'enrollments',
    'students',
    'plans',
    'finance',
    'reports',
    'locations',
    'programs',
    'members',
    'settings',
  ],
  center_admin: [
    'dashboard',
    'schedule',
    'classes',
    'enrollments',
    'students',
    'plans',
    'finance',
    'reports',
    'locations',
    'programs',
    'members',
    'settings',
  ],
  receptionist: ['dashboard', 'schedule', 'classes', 'enrollments', 'students', 'plans'],
  coach: ['dashboard', 'schedule', 'classes', 'students'],
};

/** Permissão extra que abre uma área que o papel não tem por padrão. */
const AREA_BY_PERMISSION: Partial<Record<CenterPermission, CenterArea[]>> = {
  view_enrollments: ['enrollments'],
  enroll_students: ['enrollments'],
  view_finance: ['finance', 'reports'],
  edit_plans: ['plans'],
  center_settings: ['settings', 'programs', 'locations'],
};

export interface MemberAccess {
  role: CenterRole;
  status: MemberStatus;
  extraPerms: CenterPermission[];
}

export function permissionsOf(member: MemberAccess | null): Set<CenterPermission> {
  if (!member || member.status !== 'active') {
    return new Set();
  }
  return new Set([...ROLE_DEFAULT_PERMISSIONS[member.role], ...member.extraPerms]);
}

export function hasPermission(member: MemberAccess | null, perm: CenterPermission): boolean {
  return permissionsOf(member).has(perm);
}

export function canAccessArea(member: MemberAccess | null, area: CenterArea): boolean {
  if (!member || member.status !== 'active') {
    return false;
  }
  if (ROLE_AREAS[member.role].includes(area)) {
    return true;
  }
  return member.extraPerms.some((p) => AREA_BY_PERMISSION[p]?.includes(area));
}

/** Owner e admin gerem o centro (turmas, planos, equipe, cobranças). */
export function isManager(member: MemberAccess | null): boolean {
  return member?.status === 'active' && (member.role === 'center_owner' || member.role === 'center_admin');
}

/** Quem cadastra alunos e matrículas (owner, admin, recepção ou quem tem `enroll_students`). */
export function canEnroll(member: MemberAccess | null): boolean {
  return hasPermission(member, 'enroll_students');
}

/** Quem gerencia a equipe: owner sempre; admin só não mexe em owner nem cria outro admin. */
export function canManageMember(actor: MemberAccess | null, targetRole: CenterRole): boolean {
  if (!actor || actor.status !== 'active') {
    return false;
  }
  if (actor.role === 'center_owner') {
    return targetRole !== 'center_owner';
  }
  if (actor.role === 'center_admin') {
    return targetRole === 'coach' || targetRole === 'receptionist';
  }
  return false;
}

/** Papéis que o ator pode conceder num convite. */
export function invitableRoles(actor: MemberAccess | null): CenterRole[] {
  return (['coach', 'receptionist', 'center_admin'] as CenterRole[]).filter((r) => canManageMember(actor, r));
}

/** Primeira área que o membro pode ver — destino depois do login/troca de centro. */
export function homeArea(member: MemberAccess | null): CenterArea | null {
  const order: CenterArea[] = ['dashboard', 'schedule', 'classes', 'students'];
  return order.find((a) => canAccessArea(member, a)) ?? null;
}
