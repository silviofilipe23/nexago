import { isCoachStaffRole, type CoachRole } from './coach-roles.model';

export interface CoachMembership {
  coachUid: string;
  /** Vem do espelho; só vale se for um cargo conhecido. */
  role: unknown;
  coachName: string;
}

export interface CoachContext {
  coachUid: string;
  role: CoachRole;
  coachName: string;
  /** `true` = o painel do próprio usuário (ele é o treinador principal). */
  isOwn: boolean;
}

/** Monta os painéis a que o usuário tem acesso: o próprio (se existir) + os vínculos válidos. */
export function buildContexts(
  ownUid: string | null,
  ownExists: boolean,
  memberships: readonly CoachMembership[],
): CoachContext[] {
  const out: CoachContext[] = [];
  if (ownUid && ownExists) {
    out.push({ coachUid: ownUid, role: 'principal', coachName: 'Meu painel', isOwn: true });
  }
  for (const m of memberships) {
    if (!isCoachStaffRole(m.role) || m.coachUid === ownUid) {
      continue;
    }
    out.push({ coachUid: m.coachUid, role: m.role, coachName: m.coachName || 'Treinador', isOwn: false });
  }
  return out;
}

/** Painel ativo: o preferido se ainda existir; senão o primeiro (o próprio, quando há). */
export function resolveActiveCoach(
  contexts: readonly CoachContext[],
  preferredUid: string | null,
): CoachContext | null {
  return contexts.find((c) => c.coachUid === preferredUid) ?? contexts[0] ?? null;
}
