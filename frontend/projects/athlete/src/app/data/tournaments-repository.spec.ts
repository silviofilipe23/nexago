import { categoryAcceptsRegistration, organizerPixOf, tournamentIsFinishedOrCancelled, type RegistrationTournamentFields, type TournamentCategoryOffer } from './tournaments-repository';
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
