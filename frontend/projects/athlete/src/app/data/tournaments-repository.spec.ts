import {
  categoryAcceptsRegistration,
  isPubliclyListedTournamentDoc,
  organizerPixOf,
  registrationOpensAt,
  registrationOpensLabel,
  tournamentIsFinishedOrCancelled,
  type RegistrationTournamentFields,
  type TournamentCategoryOffer,
} from './tournaments-repository';
import { normalizePixKeyForBrCode } from './pix-brcode';

describe('organizerPixOf', () => {
  it('não força keyType para "random" quando o organizador não declarou o tipo da chave', () => {
    // Torneios criados pelo wizard do organizador nunca preenchem `organizerPix.keyType`
    // (não há seletor de tipo na tela) — o campo chega vazio do Firestore.
    const pix = organizerPixOf({
      key: '62981512439',
      keyType: '',
      recipientName: 'Rayssa Suel Ramos',
      city: 'Goiânia',
    });
    expect(pix?.keyType).not.toBe('random');
  });

  it('permite normalizar telefone com +55 mesmo sem keyType declarado no torneio', () => {
    const pix = organizerPixOf({ key: '62981512439', recipientName: 'Rayssa Suel Ramos', city: 'Goiânia' });
    expect(pix).not.toBeNull();
    expect(normalizePixKeyForBrCode(pix!.key, pix!.keyType)).toBe('+5562981512439');
  });
});

describe('categoryAcceptsRegistration', () => {
  const NOW = new Date('2026-08-03T12:00:00-03:00');

  function tournament(over: Partial<RegistrationTournamentFields> = {}): RegistrationTournamentFields {
    return {
      startAt: new Date('2026-08-20T09:00:00-03:00'),
      endAt: new Date('2026-08-21T20:00:00-03:00'),
      rawStatus: 'open',
      liveMatchesNow: 0,
      enrolledCount: 4,
      capacity: 32,
      waitlistEnabled: true,
      registrationOpensAt: null,
      ...over,
    };
  }

  function category(over: Partial<Pick<TournamentCategoryOffer, 'isCompleted' | 'registrationClosed'>> = {}) {
    return { isCompleted: false, registrationClosed: false, ...over };
  }

  it('aceita enquanto o torneio está aberto e a categoria tem vaga', () => {
    expect(categoryAcceptsRegistration(tournament(), category(), 6, NOW)).toBe(true);
  });

  it('recusa quando o organizador fechou a inscrição da categoria', () => {
    expect(categoryAcceptsRegistration(tournament(), category({ registrationClosed: true }), 6, NOW)).toBe(false);
  });

  it('recusa quando a categoria já foi concluída', () => {
    expect(categoryAcceptsRegistration(tournament(), category({ isCompleted: true }), 6, NOW)).toBe(false);
  });

  it('recusa quando o torneio já terminou, mesmo com vaga sobrando', () => {
    expect(categoryAcceptsRegistration(tournament({ rawStatus: 'completed' }), category(), 6, NOW)).toBe(false);
  });

  it('recusa categoria lotada quando o torneio não tem lista de espera', () => {
    expect(categoryAcceptsRegistration(tournament({ waitlistEnabled: false }), category(), 0, NOW)).toBe(false);
  });

  it('aceita categoria lotada quando a lista de espera está ativa', () => {
    expect(categoryAcceptsRegistration(tournament({ waitlistEnabled: true }), category(), 0, NOW)).toBe(true);
  });

  it('mantém a inscrição aberta em torneio já em quadra — quem decide o fechamento é a categoria', () => {
    expect(categoryAcceptsRegistration(tournament({ rawStatus: 'live', liveMatchesNow: 2 }), category(), 6, NOW)).toBe(true);
  });

  it('recusa enquanto registrationOpensAt está no futuro — espelha o guard da CF', () => {
    const opensAt = new Date('2026-08-03T18:00:00-03:00');
    expect(categoryAcceptsRegistration(tournament({ registrationOpensAt: opensAt }), category(), 6, NOW)).toBe(false);
  });

  it('aceita a partir do instante exato de registrationOpensAt', () => {
    expect(categoryAcceptsRegistration(tournament({ registrationOpensAt: NOW }), category(), 6, NOW)).toBe(true);
    const past = new Date('2026-08-01T10:00:00-03:00');
    expect(categoryAcceptsRegistration(tournament({ registrationOpensAt: past }), category(), 6, NOW)).toBe(true);
  });
});

describe('registrationOpensAt', () => {
  it('prefere o campo real do torneio ao derivado do status', () => {
    const opens = new Date('2026-09-05T10:00:00-03:00');
    expect(
      registrationOpensAt({ rawStatus: 'open', startAt: new Date('2026-09-20T09:00:00-03:00'), registrationOpensAt: opens }),
    ).toEqual(opens);
  });

  it('sem campo real, torneio programado ainda cai no início do evento', () => {
    const start = new Date('2026-09-20T09:00:00-03:00');
    expect(registrationOpensAt({ rawStatus: 'scheduled', startAt: start, registrationOpensAt: null })).toEqual(start);
    expect(registrationOpensAt({ rawStatus: 'open', startAt: start, registrationOpensAt: null })).toBeNull();
  });
});

describe('registrationOpensLabel', () => {
  it('formata data e hora locais da abertura', () => {
    expect(registrationOpensLabel(new Date(2026, 8, 5, 10, 0))).toBe('05/09 às 10:00');
    expect(registrationOpensLabel(new Date(2026, 11, 1, 7, 5))).toBe('01/12 às 07:05');
  });
});

describe('tournamentIsFinishedOrCancelled', () => {
  it('acabou quando o organizador finalizou ou encerrou', () => {
    expect(tournamentIsFinishedOrCancelled({ rawStatus: 'completed', isCancelled: false })).toBe(true);
    expect(tournamentIsFinishedOrCancelled({ rawStatus: 'ended', isCancelled: false })).toBe(true);
  });

  it('acabou quando foi cancelado', () => {
    // `rawStatusFromString` colapsa cancelado em `ended`; a flag é a garantia se isso mudar.
    expect(tournamentIsFinishedOrCancelled({ rawStatus: 'ended', isCancelled: true })).toBe(true);
    expect(tournamentIsFinishedOrCancelled({ rawStatus: null, isCancelled: true })).toBe(true);
  });

  it('não acabou enquanto está por vir, aberto ou rolando', () => {
    for (const rawStatus of ['scheduled', 'open', 'bracketsReady', 'almostFull', 'live', null] as const) {
      expect(tournamentIsFinishedOrCancelled({ rawStatus, isCancelled: false })).toBe(false);
    }
  });
});

describe('isPubliclyListedTournamentDoc', () => {
  it('esconde do catálogo o torneio publicado "por link"', () => {
    expect(isPubliclyListedTournamentDoc({ listingStatus: 'open', visibility: 'linkOnly' })).toBe(false);
  });

  it('mantém no catálogo o torneio público', () => {
    expect(isPubliclyListedTournamentDoc({ listingStatus: 'open', visibility: 'publicListing' })).toBe(true);
  });

  it('mantém o torneio antigo, criado antes do seletor de visibilidade', () => {
    expect(isPubliclyListedTournamentDoc({ listingStatus: 'open' })).toBe(true);
  });

  it('rascunho e cancelado seguem fora, mesmo marcados como públicos', () => {
    expect(isPubliclyListedTournamentDoc({ listingStatus: 'draft', visibility: 'publicListing' })).toBe(false);
    expect(isPubliclyListedTournamentDoc({ listingStatus: 'cancelled', visibility: 'publicListing' })).toBe(false);
  });

  it('cai para `status` quando o doc não tem `listingStatus`', () => {
    expect(isPubliclyListedTournamentDoc({ status: 'open', visibility: 'linkOnly' })).toBe(false);
    expect(isPubliclyListedTournamentDoc({ status: 'open' })).toBe(true);
  });
});
