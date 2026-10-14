import {
  COACH_AREAS,
  COACH_STAFF_ROLES,
  ROLE_LABELS,
  isCoachStaffRole,
  roleCanAccess,
  type CoachArea,
  type CoachStaffRole,
} from './coach-roles.model';

describe('coach-roles.model', () => {
  it('isCoachStaffRole aceita só os quatro cargos (principal não é cargo de staff)', () => {
    for (const r of ['auxiliar', 'preparador_fisico', 'fisioterapeuta', 'psicologo']) {
      expect(isCoachStaffRole(r)).toBeTrue();
    }
    for (const r of ['principal', 'dono', '', undefined, null, 3]) {
      expect(isCoachStaffRole(r)).toBeFalse();
    }
  });

  it('principal acessa toda área em leitura e escrita, e a área "principal"', () => {
    for (const area of [...COACH_AREAS, 'principal' as const]) {
      expect(roleCanAccess('principal', area, 'read')).toBeTrue();
      expect(roleCanAccess('principal', area, 'write')).toBeTrue();
    }
  });

  it('nenhum cargo de staff acessa a área "principal"', () => {
    for (const role of COACH_STAFF_ROLES) {
      expect(roleCanAccess(role, 'principal', 'read')).toBeFalse();
    }
  });

  it('matriz exata por cargo (escrita implica leitura)', () => {
    const expected: Record<CoachStaffRole, { w: CoachArea[]; r: CoachArea[] }> = {
      auxiliar: { w: ['treinos', 'convocacoes', 'comunicacao'], r: ['atletas', 'avaliacoes'] },
      preparador_fisico: { w: ['fisico'], r: ['atletas', 'treinos', 'avaliacoes'] },
      fisioterapeuta: { w: ['saude'], r: ['atletas', 'treinos', 'fisico'] },
      psicologo: { w: ['mental'], r: ['atletas'] },
    };
    for (const role of COACH_STAFF_ROLES) {
      const writes = COACH_AREAS.filter((a) => roleCanAccess(role, a, 'write'));
      const readOnly = COACH_AREAS.filter((a) => roleCanAccess(role, a, 'read') && !roleCanAccess(role, a, 'write'));
      expect([...writes].sort()).toEqual([...expected[role].w].sort());
      expect([...readOnly].sort()).toEqual([...expected[role].r].sort());
    }
  });

  it('financeiro e equipe só o principal', () => {
    for (const role of COACH_STAFF_ROLES) {
      for (const area of ['financeiro', 'equipe'] as const) {
        expect(roleCanAccess(role, area, 'read')).toBeFalse();
      }
    }
  });

  it('todo cargo tem rótulo', () => {
    for (const role of ['principal', ...COACH_STAFF_ROLES] as const) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});
