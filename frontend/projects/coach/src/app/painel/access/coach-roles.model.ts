/**
 * Cargos da comissão técnica e matriz de acesso por área — ESPELHO MANUAL de
 * `functions/src/coach-staff-roles.ts` e dos mapas `coachWriteAreas`/`coachReadAreas` em
 * `firestore.rules`. `functions/test/coach-roles-parity.test.mjs` lê este arquivo por regex e
 * compara com os dois: mantenha o formato (uma entrada `cargo: ['area', …],` por linha).
 *
 * `principal` é o dono do painel (`uid == coachUid`), não um cargo de staff. `'principal'` como
 * *área* (`PanelArea`) marca telas só do dono (perfil, biblioteca, IA).
 */
export const COACH_STAFF_ROLES = ['auxiliar', 'preparador_fisico', 'fisioterapeuta', 'psicologo'] as const;
export type CoachStaffRole = (typeof COACH_STAFF_ROLES)[number];
export type CoachRole = 'principal' | CoachStaffRole;

export const COACH_AREAS = [
  'atletas',
  'treinos',
  'convocacoes',
  'avaliacoes',
  'fisico',
  'saude',
  'mental',
  'comunicacao',
  'financeiro',
  'equipe',
] as const;
export type CoachArea = (typeof COACH_AREAS)[number];

export type PanelArea = CoachArea | 'principal';
export type AccessMode = 'read' | 'write';

export function isCoachStaffRole(value: unknown): value is CoachStaffRole {
  return typeof value === 'string' && (COACH_STAFF_ROLES as readonly string[]).includes(value);
}

/** Áreas em que o cargo escreve. Escrita implica leitura. */
const COACH_WRITE_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ['treinos', 'convocacoes', 'comunicacao'],
  preparador_fisico: ['fisico'],
  fisioterapeuta: ['saude'],
  psicologo: ['mental'],
};

/** Áreas só de leitura, somadas às de escrita. */
const COACH_READ_ONLY_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ['atletas', 'avaliacoes'],
  preparador_fisico: ['atletas', 'treinos', 'avaliacoes'],
  fisioterapeuta: ['atletas', 'treinos', 'fisico'],
  psicologo: ['atletas'],
};

export function roleCanAccess(role: CoachRole, area: PanelArea, mode: AccessMode): boolean {
  if (role === 'principal') {
    return true;
  }
  if (area === 'principal') {
    return false;
  }
  const writes = (COACH_WRITE_AREAS[role] ?? []).includes(area);
  return mode === 'write' ? writes : writes || (COACH_READ_ONLY_AREAS[role] ?? []).includes(area);
}

export const ROLE_LABELS: Record<CoachRole, string> = {
  principal: 'Treinador principal',
  auxiliar: 'Auxiliar',
  preparador_fisico: 'Preparador físico',
  fisioterapeuta: 'Fisioterapeuta',
  psicologo: 'Psicólogo',
};

export const ROLE_SUMMARIES: Record<CoachRole, string> = {
  principal: 'Acesso total: atletas, treinos, avaliações, convocações, financeiro e a própria comissão',
  auxiliar: 'Treinos, presença, convocações e comunicação — sem edição de permissões',
  preparador_fisico: 'Plano de evolução física e condicionamento',
  fisioterapeuta: 'Módulo de lesões e histórico de saúde',
  psicologo: 'Notas de acompanhamento mental — acesso restrito',
};
