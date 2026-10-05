import {
  categoryFormatLabel,
  categoryUnitLabel,
  categoryUnitSingular,
  isIndividualCategoryOffer,
  isTeamCategoryOffer,
  tournamentSummaryFromDoc,
} from '../data/tournaments-repository';
import { duoNameOf } from './duo-identity';
import { duoNameOf as activityDuoNameOf } from '../profile/public-profile-activity';
import { registrationTermsCopy } from './registration/wizard/registration-terms-copy';
import type { ArenaTeam } from '../data/teams-repository';
import type { AthletePublicProfile } from '../data/public-profiles-repository';

/** Categoria individual no portal do atleta (multiesporte fase 4c). */
describe('categoria individual (fase 4c)', () => {
  const summary = (categories: Record<string, unknown>[], format?: string) =>
    tournamentSummaryFromDoc('T', { name: 'Open', categories, ...(format ? { format } : {}) });

  it('teamSize 1 chega como individual; não é equipe; rótulos de atleta', () => {
    const [c] = summary([{ id: 'c1', categoryName: 'Simples', teamSize: 1 }]).categories;
    expect(c!.teamSize).toBe(1);
    expect(isIndividualCategoryOffer(c!)).toBeTrue();
    expect(isTeamCategoryOffer(c!)).toBeFalse();
    expect(categoryFormatLabel(c!)).toBe('Individual');
    expect(categoryUnitLabel(c!)).toBe('atletas');
    expect(categoryUnitSingular(c!)).toBe('atleta');
  });

  it('formato do torneio: individual só quando todas as categorias são individuais', () => {
    expect(summary([{ id: 'c1', teamSize: 1 }], 'individual').format).toBe('Individual');
    expect(summary([{ id: 'c1', teamSize: 1 }, { id: 'c2' }], 'individual').format).toBe('Dupla');
  });

  it('condições: inscrição direta, sem parceiro', () => {
    const copy = registrationTermsCopy({ category: { teamSize: 1 }, requireFormedPair: true, hasReceivedInvite: false });
    expect(copy.eyebrow).toBe('INDIVIDUAL');
    expect(copy.registersDirectly).toBeTrue();
    expect(copy.allowsSolo).toBeFalse();
    expect(copy.secondaryLabel).toBeNull();
    expect(registrationTermsCopy({ category: { teamSize: null }, requireFormedPair: false, hasReceivedInvite: false }).registersDirectly).toBeFalse();
  });

  it('nome do participante individual é o atleta, sem "/ Atleta"', () => {
    const team = { player1Id: 'a', player2Id: '', memberUids: ['a'], teamName: null } as unknown as ArenaTeam;
    const teams = new Map([['t1', team]]);
    const profiles = new Map([['a', { displayName: 'Ana Souza' } as AthletePublicProfile]]);
    expect(duoNameOf(teams, profiles, 't1')).toBe('Ana Souza');
    expect(activityDuoNameOf('t1', teams, profiles, null)).toBe('Ana Souza');
  });
});
