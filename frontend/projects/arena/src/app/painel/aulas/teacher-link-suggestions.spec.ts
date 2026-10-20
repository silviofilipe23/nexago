import type { ArenaProfessorLink } from '../profissionais/arena-professor.model';
import { teacherSuggestionsFromLinks } from './teacher-link-suggestions';

function link(over: Partial<ArenaProfessorLink>): ArenaProfessorLink {
  return {
    id: `a1_${over.professorUserId ?? 'u'}`,
    arenaId: 'a1',
    professorUserId: 'u',
    relationshipType: 'ARENA_STAFF',
    status: 'ACTIVE',
    initiatedBy: 'ARENA',
    permissions: {
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: true,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
    },
    message: null,
    cycle: 1,
    professorName: 'Professor',
    professorPhotoUrl: null,
    professorModalities: [],
    createdAt: null,
    updatedAt: null,
    invitedAt: null,
    requestedAt: null,
    expiresAt: null,
    respondedAt: null,
    approvedAt: null,
    suspendedAt: null,
    endedAt: null,
    canceledAt: null,
    invitedByName: null,
    approvedByName: null,
    endedBySide: null,
    rejectionReason: null,
    suspensionReason: null,
    suspensionDetails: null,
    endedReason: null,
    ...over,
  };
}

describe('teacherSuggestionsFromLinks', () => {
  it('só vínculo ativo, fora quem já é professor das Aulas, em ordem alfabética', () => {
    const suggestions = teacherSuggestionsFromLinks(
      [
        link({ professorUserId: 'u3', professorName: 'Rafael Cunha', professorPhotoUrl: 'https://x/r.jpg' }),
        link({ professorUserId: 'u1', professorName: 'Marcos Lima' }),
        link({ professorUserId: 'u2', professorName: 'Ana Souza' }),
        link({ professorUserId: 'u4', professorName: 'Bruna Alves', status: 'SUSPENDED' }),
        link({ professorUserId: 'u5', professorName: 'Caio Prado', status: 'PENDING' }),
        link({ professorUserId: 'u6', professorName: 'Duda Reis', status: 'ENDED' }),
      ],
      ['u2', null],
    );

    expect(suggestions).toEqual([
      { id: 'u1', name: 'Marcos Lima', photoUrl: null },
      { id: 'u3', name: 'Rafael Cunha', photoUrl: 'https://x/r.jpg' },
    ]);
  });

  it('sem vínculo, sem sugestão', () => {
    expect(teacherSuggestionsFromLinks([], [])).toEqual([]);
  });
});
