import { EMPTY_TOURNAMENT_COLLECTED } from './tournament-collected';
import { effectiveTelaoConfig, telaoConfigFromRaw } from './tournaments-repository';
import type { OrganizerTournament } from './tournament.model';

/** Retrocompatibilidade: torneios gravados antes do QR não têm o campo no doc, e a TV deles
 *  precisa continuar mostrando o QR (mesmo padrão `!== false` de `showStreak`). */
describe('telaoConfigFromRaw · showPublicQr', () => {
  it('assume ligado quando o doc antigo não tem o campo', () => {
    const cfg = telaoConfigFromRaw({ courtIds: ['q1'], showCall: true });
    expect(cfg?.showPublicQr).toBe(true);
  });

  it('respeita o desligamento explícito', () => {
    const cfg = telaoConfigFromRaw({ courtIds: ['q1'], showPublicQr: false });
    expect(cfg?.showPublicQr).toBe(false);
  });

  it('devolve null quando não há config gravada', () => {
    expect(telaoConfigFromRaw(undefined)).toBeNull();
  });
});

describe('effectiveTelaoConfig · showPublicQr', () => {
  function tournament(bigScreen: OrganizerTournament['bigScreen']): OrganizerTournament {
    return {
      id: 't1',
      name: 'Copa de Verão',
      managerId: 'u1',
      sportLabel: 'Beach tennis',
      sportId: 'beachTennis',
      coverUrl: null,
      status: 'andamento',
      visibility: 'publicListing',
      paymentMode: 'appPixCard',
      collected: EMPTY_TOURNAMENT_COLLECTED,
      startAt: null,
      endAt: null,
      city: null,
      location: null,
      categories: [],
      capacity: null,
      waitlistEnabled: true,
      leagueId: null,
      courts: [{ id: 'q1', name: '1', order: 0 }],
      courtsCount: 1,
      matchOps: { dayStart: '07:00', dayEnd: '24:00', defaultMatchDurationMin: 40, minRestBetweenMatchesMin: 20, dynamicRescheduleEnabled: false },
      bigScreen,
      uniformRequired: false,
      uniformNumberOnShirt: false,
      uniformNameOnShirt: false,
    };
  }

  it('liga o QR por padrão quando o torneio nunca configurou o telão', () => {
    expect(effectiveTelaoConfig(tournament(null)).showPublicQr).toBe(true);
  });

  it('preserva o QR desligado na config gravada', () => {
    const saved = {
      courtIds: ['q1'],
      showUpcoming: true,
      showCall: true,
      showAvatars: true,
      autoRotate: true,
      showStreak: true,
      showFinalMode: true,
      showPublicQr: false,
    };
    expect(effectiveTelaoConfig(tournament(saved)).showPublicQr).toBe(false);
  });
});
