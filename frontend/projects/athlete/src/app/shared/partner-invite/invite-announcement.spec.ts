import type { PendingPartnerInvite } from '../../data/partner-invites.service';
import type { TournamentPartnerInvite } from '../../data/tournament-registrations-repository';
import type { TournamentSummary } from '../../data/tournaments-repository';
import {
  announcedStorageKey,
  inviteAnnouncementHeadline,
  nextInviteToAnnounce,
  readAnnouncedInviteIds,
  rememberAnnouncedInvite,
} from './invite-announcement';

const SESSION_START = 1_700_000_000_000;

function item(
  id: string,
  overrides: Partial<TournamentPartnerInvite> = {},
  tournament: TournamentSummary | null = { id: 't1', name: 'Copa VH', isCancelled: false } as TournamentSummary,
): PendingPartnerInvite {
  const invite: TournamentPartnerInvite = {
    id,
    tournamentId: 't1',
    categoryId: 'c1',
    inviterUid: 'u1',
    inviterName: 'Bia',
    createdAt: new Date(SESSION_START - 60_000),
    expiresAt: null,
    isTeamInvite: false,
    teamName: null,
    teamSize: null,
    ...overrides,
  };
  return { invite, tournament };
}

describe('nextInviteToAnnounce', () => {
  it('anuncia o convite pendente que já existia quando a sessão começou', () => {
    const next = nextInviteToAnnounce([item('i1')], new Set(), SESSION_START);

    expect(next?.invite.id).toBe('i1');
  });

  it('não repete o convite já anunciado nesta sessão', () => {
    const next = nextInviteToAnnounce([item('i1')], new Set(['i1']), SESSION_START);

    expect(next).toBeNull();
  });

  it('não interrompe a sessão com convite que chegou depois — esse fica pro badge e pro card', () => {
    const chegouAgora = item('i2', { createdAt: new Date(SESSION_START + 5_000) });

    expect(nextInviteToAnnounce([chegouAgora], new Set(), SESSION_START)).toBeNull();
  });

  it('anuncia convite sem createdAt (doc antigo) em vez de engolir', () => {
    const next = nextInviteToAnnounce([item('i1', { createdAt: null })], new Set(), SESSION_START);

    expect(next?.invite.id).toBe('i1');
  });

  it('começa pelo mais antigo — é o que expira primeiro', () => {
    const novo = item('novo', { createdAt: new Date(SESSION_START - 1_000) });
    const antigo = item('antigo', { createdAt: new Date(SESSION_START - 90_000) });

    expect(nextInviteToAnnounce([novo, antigo], new Set(), SESSION_START)?.invite.id).toBe('antigo');
  });

  it('devolve null quando não há convite pendente', () => {
    expect(nextInviteToAnnounce([], new Set(), SESSION_START)).toBeNull();
  });
});

describe('memória de anúncio da sessão', () => {
  const uid = 'atleta-1';

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterAll(() => {
    sessionStorage.clear();
  });

  it('lembra o convite já anunciado', () => {
    rememberAnnouncedInvite(uid, 'i1');

    expect(readAnnouncedInviteIds(uid).has('i1')).toBeTrue();
  });

  it('acumula sem apagar o anterior', () => {
    rememberAnnouncedInvite(uid, 'i1');
    rememberAnnouncedInvite(uid, 'i2');

    expect([...readAnnouncedInviteIds(uid)].sort()).toEqual(['i1', 'i2']);
  });

  it('separa por uid — trocar de conta na mesma aba reanuncia', () => {
    rememberAnnouncedInvite(uid, 'i1');

    expect(readAnnouncedInviteIds('outro-atleta').size).toBe(0);
  });

  it('trata conteúdo corrompido como "nada anunciado" em vez de quebrar a tela', () => {
    sessionStorage.setItem(announcedStorageKey(uid), '{isso não é json');

    expect(readAnnouncedInviteIds(uid).size).toBe(0);
  });
});

describe('inviteAnnouncementHeadline', () => {
  it('fala de dupla no convite comum', () => {
    expect(inviteAnnouncementHeadline(item('i1'))).toBe('Bia te chamou pra formar dupla no Copa VH.');
  });

  it('fala da equipe nomeada quando é categoria de trio+', () => {
    const equipe = item('i1', { isTeamInvite: true, teamName: 'Areia Quente', teamSize: 4 });

    expect(inviteAnnouncementHeadline(equipe)).toBe(
      'Bia te chamou pra jogar pela equipe Areia Quente no Copa VH.',
    );
  });

  it('usa nome genérico quando o torneio não carregou — sumir seria pior', () => {
    expect(inviteAnnouncementHeadline(item('i1', {}, null))).toBe(
      'Bia te chamou pra formar dupla no Torneio.',
    );
  });
});
