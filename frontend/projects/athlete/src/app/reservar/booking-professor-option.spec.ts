import type { ProfessorLink } from '../professor/professor-links.model';
import { professorBookingOption } from './booking-professor-option';

function link(over: Partial<ProfessorLink>): ProfessorLink {
  return {
    id: 'arena1_u1',
    arenaId: 'arena1',
    relationshipType: 'INDEPENDENT',
    status: 'ACTIVE',
    permissions: { canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false },
    ...over,
  } as ProfessorLink;
}

describe('professorBookingOption', () => {
  it('vínculo ativo com "Reservar quadras" nesta arena: mostra, com o tipo', () => {
    expect(professorBookingOption([link({})], 'arena1')?.label).toBe('Independente');
    expect(
      professorBookingOption([link({ relationshipType: 'ARENA_STAFF' })], 'arena1')?.label,
    ).toBe('Equipe da arena');
  });

  it('esconde: outra arena, permissão desligada ou vínculo fora de ACTIVE', () => {
    expect(professorBookingOption([link({})], 'arena2')).toBeNull();
    expect(
      professorBookingOption(
        [link({ permissions: { canManageOwnLessons: true, canBookCourts: false, canAppearInArenaProfile: false } })],
        'arena1',
      ),
    ).toBeNull();
    for (const status of ['SUSPENDED', 'PENDING', 'INVITED', 'ENDED'] as const) {
      expect(professorBookingOption([link({ status })], 'arena1')).withContext(status).toBeNull();
    }
    expect(professorBookingOption([], 'arena1')).toBeNull();
  });
});
