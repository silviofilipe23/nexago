import type { PendingPartnerInvite } from '../../data/partner-invites.service';
import type { TournamentPartnerInvite } from '../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../../data/tournaments-repository';
import {
  announcedStorageKey,
  inviteAgeLabel,
  inviteAnnouncementSubtitle,
  inviteAnnouncementTitle,
  inviteCategoryLabel,
  inviteCtaHint,
  inviteDeadline,
  inviteInitials,
  inviteShareLabel,
  inviteWhenLabel,
  inviteWhereLabel,
  nextInviteToAnnounce,
  readAnnouncedInviteIds,
  rememberAnnouncedInvite,
} from './invite-announcement';

const SESSION_START = 1_700_000_000_000;

/** O Intl separa `R$` do número com espaço inquebrável (U+00A0) — normaliza pra asserção
 *  não depender de um caractere invisível. */
function brl(value: string | null): string | null {
  return value?.replace(/\u00a0/g, ' ') ?? null;
}

function tournament(
  overrides: Partial<TournamentSummary> = {},
  category: Partial<TournamentCategoryOffer> = {},
): TournamentSummary {
  return {
    id: 't1',
    name: 'Copa VH',
    location: 'Arena CFC',
    city: 'Aparecida',
    startAt: new Date(2026, 5, 20, 8, 0),
    isCancelled: false,
    paymentMode: 'appPixCard',
    categories: [
      {
        id: 'c1',
        categoryName: 'Masc. Intermediário',
        entryFee: 360,
        teamSize: null,
        ...category,
      } as TournamentCategoryOffer,
    ],
    ...overrides,
  } as TournamentSummary;
}

function itemWithCategory(category: Partial<TournamentCategoryOffer>): PendingPartnerInvite {
  return item('i1', {}, tournament({}, category));
}

function itemWithTournament(overrides: Partial<TournamentSummary>): PendingPartnerInvite {
  return item('i1', {}, tournament(overrides));
}

function item(
  id: string,
  overrides: Partial<TournamentPartnerInvite> = {},
  summary: TournamentSummary | null = tournament(),
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
    isSubstitutionInvite: false,
    replacedName: null,
    ...overrides,
  };
  return { invite, tournament: summary };
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

describe('título e apoio', () => {
  it('fala de dupla no convite comum', () => {
    expect(inviteAnnouncementTitle(item('i1'))).toBe('Bia te chamou pra dupla');
  });

  it('fala da equipe nomeada quando é categoria de trio+', () => {
    const equipe = item('i1', { isTeamInvite: true, teamName: 'Areia Quente', teamSize: 4 });

    expect(inviteAnnouncementTitle(equipe)).toBe('Bia te chamou pra equipe Areia Quente');
  });

  it('a linha de apoio não afirma nada sobre a inscrição nem o pagamento do parceiro', () => {
    const texto = inviteAnnouncementSubtitle(item('i1'));

    expect(texto).toBe('Ele te chamou pro Copa VH. Falta só você aceitar pra dupla estar fechada.');
    expect(texto).not.toContain('confirmou');
    expect(texto).not.toContain('pagou');
  });

  it('usa nome genérico quando o torneio não carregou — sumir seria pior', () => {
    expect(inviteAnnouncementSubtitle(item('i1', {}, null))).toContain('pro Torneio.');
  });
});

describe('inviteInitials', () => {
  it('pega primeira e última iniciais', () => {
    expect(inviteInitials('Bia Marchetti')).toBe('BM');
  });

  it('nome único ainda rende duas letras — uma só fica órfã no avatar', () => {
    expect(inviteInitials('Luquinhas')).toBe('LU');
  });

  it('nome único de uma letra não inventa a segunda', () => {
    expect(inviteInitials('J')).toBe('J');
  });

  it('nome vazio não quebra o avatar', () => {
    expect(inviteInitials('   ')).toBe('AT');
  });
});

describe('inviteAgeLabel', () => {
  const now = SESSION_START;

  it('minutos, horas e dias', () => {
    expect(inviteAgeLabel(new Date(now - 30_000), now)).toBe('AGORA');
    expect(inviteAgeLabel(new Date(now - 12 * 60_000), now)).toBe('HÁ 12 MIN');
    expect(inviteAgeLabel(new Date(now - 2 * 3_600_000), now)).toBe('HÁ 2 H');
    expect(inviteAgeLabel(new Date(now - 3 * 86_400_000), now)).toBe('HÁ 3 D');
  });

  it('sem createdAt não inventa idade', () => {
    expect(inviteAgeLabel(null, now)).toBeNull();
  });
});

describe('inviteDeadline', () => {
  const now = SESSION_START;

  it('conta o que resta e mede quanto do prazo já passou', () => {
    const criado = new Date(now - 2 * 3_600_000);
    const expira = new Date(now + 22 * 3_600_000);

    const deadline = inviteDeadline(criado, expira, now);

    expect(deadline?.label).toBe('Restam 22 h pra responder — depois o convite expira.');
    expect(Math.round(deadline!.elapsedPct)).toBe(8);
  });

  it('não promete o que acontece com a vaga — só que o convite expira', () => {
    const deadline = inviteDeadline(new Date(now), new Date(now + 3_600_000), now);

    expect(deadline?.label).not.toContain('vaga');
  });

  it('sem expiresAt não há contagem', () => {
    expect(inviteDeadline(new Date(now), null, now)).toBeNull();
  });

  it('prazo já vencido some em vez de mostrar número negativo', () => {
    expect(inviteDeadline(new Date(now - 7_200_000), new Date(now - 60_000), now)).toBeNull();
  });

  it('sem createdAt a barra fica vazia em vez de chutar o começo', () => {
    expect(inviteDeadline(null, new Date(now + 3_600_000), now)?.elapsedPct).toBe(0);
  });
});

describe('linhas do quadro (categoria, quando, onde, sua parte)', () => {
  it('resolve o nome da categoria pelo id do convite', () => {
    expect(inviteCategoryLabel(item('i1'))).toBe('Masc. Intermediário');
  });

  it('categoria que não existe no torneio não vira linha', () => {
    expect(inviteCategoryLabel(item('i1', { categoryId: 'fantasma' }))).toBeNull();
  });

  it('formata dia e hora do torneio', () => {
    expect(inviteWhenLabel(new Date(2026, 5, 20, 8, 0))).toBe('sáb · 20 jun · 08h');
  });

  it('mostra os minutos quando não é hora cheia', () => {
    expect(inviteWhenLabel(new Date(2026, 5, 20, 8, 30))).toBe('sáb · 20 jun · 08h30');
  });

  it('junta local e cidade, sem repetir quando são iguais', () => {
    expect(inviteWhereLabel(item('i1'))).toBe('Arena CFC · Aparecida');
  });

  it('divide a taxa pelo elenco — é a cota, não o total da dupla', () => {
    expect(brl(inviteShareLabel(item('i1')))).toBe('R$ 180');
  });

  it('torneio sem taxa diz Grátis em vez de R$ 0', () => {
    expect(inviteShareLabel(itemWithCategory({ entryFee: 0 }))).toBe('Grátis');
  });

  it('divide pelo tamanho do elenco no trio+', () => {
    expect(brl(inviteShareLabel(itemWithCategory({ entryFee: 360, teamSize: 4 })))).toBe('R$ 90');
  });

  it('sem categoria resolvida não inventa valor', () => {
    expect(inviteShareLabel(item('i1', { categoryId: 'fantasma' }))).toBeNull();
  });
});

describe('inviteCtaHint', () => {
  it('pagamento pelo app: a cota vem na etapa seguinte', () => {
    expect(inviteCtaHint(item('i1'))).toBe('Você paga sua parte na etapa seguinte');
  });

  it('pago por fora: não promete etapa de pagamento no app', () => {
    expect(inviteCtaHint(itemWithTournament({ paymentMode: 'directWithOrganizer' }))).toBe(
      'O pagamento é direto com o organizador',
    );
  });

  it('torneio grátis não fala de pagamento nenhum', () => {
    expect(inviteCtaHint(itemWithCategory({ entryFee: 0 }))).toBeNull();
  });
});
