import type { CenterInvite, CenterMember } from '../../domain/models';
import { PERMISSION_ORDER, ROLE_DEFAULT_PERMISSIONS, type CenterPermission, type CenterRole } from '../../domain/roles';

export type TeamRow =
  | { kind: 'member'; key: string; name: string; email: string; role: CenterRole; status: 'active' | 'invited' | 'revoked'; since: Date | null; programIds: string[]; member: CenterMember }
  | { kind: 'invite'; key: string; name: string; email: string; role: CenterRole; status: 'invited'; since: Date | null; programIds: string[]; invite: CenterInvite };

export const MEMBER_STATUS: Record<TeamRow['status'], [string, string]> = {
  active: ['Ativo', 'green'],
  invited: ['Convidado', 'yellow'],
  revoked: ['Revogado', 'dim'],
};

const ROLE_ORDER: Record<CenterRole, number> = { center_owner: 0, center_admin: 1, coach: 2, receptionist: 3 };
const STATUS_ORDER: Record<TeamRow['status'], number> = { active: 0, invited: 1, revoked: 2 };

/** Equipe + convites pendentes numa lista só: ativos primeiro, por papel e nome. */
export function buildTeamRows(members: CenterMember[], invites: CenterInvite[]): TeamRow[] {
  const rows: TeamRow[] = [
    ...members.map((m): TeamRow => ({
      kind: 'member',
      key: m.uid,
      name: m.displayName || m.email || 'Sem nome',
      email: m.email,
      role: m.role,
      status: m.status,
      since: m.status === 'revoked' ? m.revokedAt : m.joinedAt,
      programIds: m.programIds,
      member: m,
    })),
    ...invites
      .filter((i) => i.status === 'pending')
      .map((i): TeamRow => ({
        kind: 'invite',
        key: 'invite:' + i.id,
        name: i.displayName || i.email,
        email: i.email,
        role: i.role,
        status: 'invited',
        since: i.createdAt,
        programIds: i.programIds,
        invite: i,
      })),
  ];
  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/** "8 vínculos · 5 professores · 1 recepção · 1 admin" (só vínculos ativos). */
export function teamSummary(members: CenterMember[]): string {
  const active = members.filter((m) => m.status === 'active');
  const count = (r: CenterRole) => active.filter((m) => m.role === r).length;
  const parts = [`${active.length} ${active.length === 1 ? 'vínculo' : 'vínculos'}`];
  const coaches = count('coach');
  const recep = count('receptionist');
  const admins = count('center_admin');
  if (coaches) parts.push(`${coaches} ${coaches === 1 ? 'professor' : 'professores'}`);
  if (recep) parts.push(`${recep} recepção`);
  if (admins) parts.push(`${admins} ${admins === 1 ? 'admin' : 'admins'}`);
  return parts.join(' · ');
}

export interface PermissionView {
  perm: CenterPermission;
  /** Vem com o papel: aparece ligada e travada. */
  isDefault: boolean;
  on: boolean;
  /** Ligada além do padrão do papel. */
  extra: boolean;
}

export function permissionView(role: CenterRole, extraPerms: CenterPermission[]): PermissionView[] {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role];
  return PERMISSION_ORDER.map((perm) => {
    const isDefault = defaults.includes(perm);
    const extra = !isDefault && extraPerms.includes(perm);
    return { perm, isDefault, on: isDefault || extra, extra };
  });
}

/** Liga/desliga um extra mantendo a ordem canônica e descartando o que já é padrão do papel. */
export function toggleExtra(role: CenterRole, extraPerms: CenterPermission[], perm: CenterPermission, on: boolean): CenterPermission[] {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role];
  const set = new Set(extraPerms.filter((p) => !defaults.includes(p)));
  if (on && !defaults.includes(perm)) {
    set.add(perm);
  } else {
    set.delete(perm);
  }
  return PERMISSION_ORDER.filter((p) => set.has(p));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Erro do convite (e-mail inválido, já é da equipe, convite pendente) ou null. */
export function inviteEmailError(raw: string, members: CenterMember[], invites: CenterInvite[]): string | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email)) {
    return 'Informe um e-mail válido.';
  }
  if (members.some((m) => m.status === 'active' && m.email.toLowerCase() === email)) {
    return 'Essa pessoa já faz parte da equipe.';
  }
  if (invites.some((i) => i.status === 'pending' && i.email.toLowerCase() === email)) {
    return 'Já existe um convite pendente para esse e-mail.';
  }
  return null;
}
