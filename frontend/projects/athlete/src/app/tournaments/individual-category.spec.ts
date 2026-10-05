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

import { uniformSlotForUid } from '../painel/registration-progress';
import { registrationRosterView } from './tabs/registration-roster-cta';
import { registrationTabHeroBody } from './tabs/registration-tab-view';

describe('inscrição individual · uniforme, sucesso (fase 4c, revisão)', () => {
  it('uniforme da individual mora no slot Player1 (como o servidor grava)', () => {
    const filled = { sizeTop: 'M', sizeShorts: null, jerseyNumber: null, jerseyName: null } as never;
    const slot = uniformSlotForUid({
      player1Id: 'me', participantUids: ['me'], uniformPlayer1: filled, uniformPlayer2: {} as never,
      teamSize: 1, uniformByUid: {},
    }, 'me');
    expect(slot).toBe(filled);
  });

  it('a aba "Minha inscrição" fala com o atleta, não com uma equipe', () => {
    const view = registrationRosterView({ teamSize: 1, partnerPending: false, captainUid: null, player1Id: 'me', participantUids: ['me'] }, 'me');
    expect(view.teamLabel).toBe('Atleta');
    const hero = registrationTabHeroBody({ paymentState: 'paid', teamLabel: 'Atleta', rosterComplete: true, entryFee: 120, paymentHint: '' });
    expect(hero.title).toBe('Inscrição completa. Você está dentro.');
    expect(hero.body).toContain('você entra no sorteio da chave');
    expect(registrationTabHeroBody({ paymentState: 'pending', teamLabel: 'Atleta', rosterComplete: true, entryFee: 120, paymentHint: 'h' }).title)
      .toBe('Inscrição feita. Falta o pagamento.');
  });
});
