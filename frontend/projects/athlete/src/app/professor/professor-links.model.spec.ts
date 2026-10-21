import {
  NO_PERMISSIONS,
  acceptInviteLabel,
  arenaInitials,
  courtDiscountLine,
  displayStatus,
  duplicateCopy,
  duplicateFromError,
  effectivePermissions,
  eventMetaLine,
  eventTitle,
  filterArenaOptions,
  formatRelativeDayTime,
  inviteBannerSubtitle,
  inviteBannerTitle,
  inviteExpiryLabel,
  inviteNote,
  isExpiredInviteError,
  isInviteExpired,
  isLinkOpen,
  linkActions,
  linkDateLine,
  linkDetailSubtitle,
  linkReasonLine,
  linksSubtitle,
  openInvites,
  openLinkForArena,
  otherArenasSentence,
  parseProfessorLink,
  parseProfessorLinkEvent,
  permissionsCaption,
  permissionGroupsFor,
  permissionsToShow,
  professorErrorMessage,
  professorStatusLabel,
  sortEventsDesc,
  sortLinksForList,
  type ProfessorLink,
  type ProfessorLinkEvent,
} from './professor-links.model';

/** 20 out 2026, 12:00 (horário local do navegador do teste). */
const NOW = new Date(2026, 9, 20, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function link(overrides: Partial<ProfessorLink> = {}): ProfessorLink {
  return {
    id: 'arena1_prof1',
    arenaId: 'arena1',
    professorUserId: 'prof1',
    relationshipType: 'ARENA_STAFF',
    status: 'ACTIVE',
    initiatedBy: 'PROFESSOR',
    permissions: { ...NO_PERMISSIONS, canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true },
    courtDiscountPercent: 0,
    courtDiscountStartTime: null,
    courtDiscountEndTime: null,
    message: null,
    cycle: 1,
    arenaName: 'Arena Sul',
    arenaLogoUrl: null,
    arenaCity: 'Goiânia · GO',
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
    ...overrides,
  };
}

function event(overrides: Partial<ProfessorLinkEvent> = {}): ProfessorLinkEvent {
  return {
    id: 'e1',
    eventType: 'REQUESTED',
    actorUserId: 'prof1',
    actorName: 'Thiago Mendes',
    actorRole: 'PROFESSOR',
    cycle: 1,
    fromStatus: null,
    toStatus: 'PENDING',
    reason: null,
    metadata: {},
    createdAt: new Date(2026, 4, 5, 9, 0),
    ...overrides,
  };
}

const invite = (overrides: Partial<ProfessorLink> = {}) =>
  link({
    status: 'INVITED',
    initiatedBy: 'ARENA',
    invitedAt: new Date(NOW - 2 * 60 * 60 * 1000),
    expiresAt: new Date(NOW + 7 * DAY - 2 * 60 * 60 * 1000),
    invitedByName: 'Ricardo Prado',
    ...overrides,
  });

describe('professor-links.model — estado na visão do professor', () => {
  it('rótulos do professor (tabela da spec)', () => {
    expect(professorStatusLabel('INVITED')).toBe('Convite recebido');
    expect(professorStatusLabel('PENDING')).toBe('Aguardando a arena');
    expect(professorStatusLabel('ACTIVE')).toBe('Ativo');
    expect(professorStatusLabel('SUSPENDED')).toBe('Suspenso');
    expect(professorStatusLabel('ENDED')).toBe('Encerrado');
    expect(professorStatusLabel('REJECTED')).toBe('Recusado');
    expect(professorStatusLabel('CANCELED')).toBe('Cancelado');
    expect(professorStatusLabel('EXPIRED')).toBe('Convite expirado');
  });

  it('convite vencido vira "Convite expirado" sem o servidor ter gravado EXPIRED', () => {
    const due = invite({ expiresAt: new Date(NOW) });
    expect(isInviteExpired(due, NOW)).toBeTrue();
    expect(displayStatus(due, NOW)).toBe('EXPIRED');
    expect(isLinkOpen(due, NOW)).toBeFalse();

    const fresh = invite();
    expect(isInviteExpired(fresh, NOW)).toBeFalse();
    expect(displayStatus(fresh, NOW)).toBe('INVITED');
    expect(isLinkOpen(fresh, NOW)).toBeTrue();
  });

  it('só INVITED expira — pedido pendente com expiresAt não conta', () => {
    expect(isInviteExpired(link({ status: 'PENDING', expiresAt: new Date(NOW - DAY) }), NOW)).toBeFalse();
  });

  it('permissões efetivas: configuradas só com ACTIVE', () => {
    const perms = { ...NO_PERMISSIONS, canManageOwnLessons: true, canBookCourts: false, canAppearInArenaProfile: true };
    expect(effectivePermissions(link({ status: 'ACTIVE', permissions: perms }))).toEqual(perms);
    for (const status of ['SUSPENDED', 'PENDING', 'INVITED', 'ENDED', 'REJECTED'] as const) {
      expect(effectivePermissions(link({ status, permissions: perms }))).withContext(status).toEqual(NO_PERMISSIONS);
    }
  });

  const lessonsOn = {
    canManageOwnLessons: true,
    canBookCourts: true,
    canAppearInArenaProfile: true,
    canEnrollStudents: true,
    canScheduleLessons: true,
    canCancelLessons: true,
    canBookRecurring: true,
  };

  it('Aulas da arena: efetivas só na equipe ativa; independente nunca, mesmo com a chave gravada', () => {
    expect(effectivePermissions(link({ relationshipType: 'ARENA_STAFF', permissions: lessonsOn }))).toEqual({ ...lessonsOn, canBookRecurring: false });
    const independent = effectivePermissions(link({ relationshipType: 'INDEPENDENT', permissions: lessonsOn }));
    expect(independent).toEqual({ ...lessonsOn, canEnrollStudents: false, canScheduleLessons: false, canCancelLessons: false });
    expect(effectivePermissions(link({ relationshipType: 'ARENA_STAFF', status: 'SUSPENDED', permissions: lessonsOn })).canEnrollStudents).toBeFalse();
    // Convite aberto de independente não mostra as chaves da equipe nem se vierem gravadas.
    expect(permissionsToShow(invite({ relationshipType: 'INDEPENDENT', permissions: lessonsOn }), NOW).canScheduleLessons).toBeFalse();
    expect(permissionsToShow(invite({ relationshipType: 'ARENA_STAFF', permissions: lessonsOn }), NOW).canScheduleLessons).toBeTrue();
  });

  it('horário fixo: efetivo só no independente ativo; equipe nunca, mesmo com a chave gravada', () => {
    expect(effectivePermissions(link({ relationshipType: 'INDEPENDENT', permissions: lessonsOn })).canBookRecurring).toBeTrue();
    expect(effectivePermissions(link({ relationshipType: 'INDEPENDENT', status: 'SUSPENDED', permissions: lessonsOn })).canBookRecurring).toBeFalse();
    expect(effectivePermissions(link({ relationshipType: 'ARENA_STAFF', permissions: lessonsOn })).canBookRecurring).toBeFalse();
    expect(permissionsToShow(invite({ relationshipType: 'ARENA_STAFF', permissions: lessonsOn }), NOW).canBookRecurring).toBeFalse();
    expect(permissionsToShow(invite({ relationshipType: 'INDEPENDENT', permissions: lessonsOn }), NOW).canBookRecurring).toBeTrue();
    const parsed = (permissions: Record<string, unknown>) =>
      parseProfessorLink('a_p', { arenaId: 'a', relationshipType: 'INDEPENDENT', status: 'ACTIVE', permissions })?.permissions.canBookRecurring;
    expect(parsed({ canBookRecurring: true })).toBeTrue();
    expect(parsed({ canBookRecurring: 'sim' })).toBeFalse();
    expect(parsed({})).toBeFalse();
  });

  it('grupo "Aulas da arena" só para equipe; "Turma própria" só no independente', () => {
    const staff = permissionGroupsFor('ARENA_STAFF');
    expect(staff.map((g) => g.title)).toEqual([null, 'Aulas da arena']);
    expect(staff[1].items.map((i) => i.label)).toEqual(['Matricular alunos', 'Agendar aulas e encaixes', 'Cancelar aulas e avisar alunos']);
    expect(staff[1].note).toBe('Só para professor da equipe');
    const independent = permissionGroupsFor('INDEPENDENT');
    expect(independent.map((g) => g.title)).toEqual([null, 'Turma própria']);
    expect(independent.map((g) => g.items.length)).toEqual([3, 1]);
    expect(independent[1].items[0]).toEqual(
      jasmine.objectContaining({
        key: 'canBookRecurring',
        label: 'Horário fixo (turma própria)',
        description: 'Pode reservar a quadra toda semana para uma turma dele. A reserva aparece nos horários fixos da arena.',
      }),
    );
    expect(independent[1].note).toBe('Só para professor independente');
  });

  it('convite aberto mostra o que a arena propõe; suspenso mostra tudo desligado', () => {
    const perms = { ...NO_PERMISSIONS, canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false };
    expect(permissionsToShow(invite({ permissions: perms }), NOW)).toEqual(perms);
    expect(permissionsToShow(link({ status: 'SUSPENDED', permissions: perms }), NOW)).toEqual(NO_PERMISSIONS);
    expect(permissionsCaption(link({ status: 'SUSPENDED' }), NOW)).toContain('Revogadas');
    expect(permissionsCaption(link({ status: 'PENDING' }), NOW)).toContain('após a aprovação');
    expect(permissionsCaption(invite(), NOW)).toContain('após o aceite');
  });
});

describe('professor-links.model — ações por estado', () => {
  it('cada estado oferece as ações do protótipo', () => {
    expect(linkActions(invite(), NOW)).toEqual(['accept', 'decline']);
    expect(linkActions(link({ status: 'ACTIVE' }), NOW)).toEqual(['details', 'end']);
    expect(linkActions(link({ status: 'SUSPENDED' }), NOW)).toEqual(['details', 'end']);
    expect(linkActions(link({ status: 'PENDING' }), NOW)).toEqual(['viewRequest', 'cancelRequest']);
    for (const status of ['ENDED', 'REJECTED', 'CANCELED', 'EXPIRED'] as const) {
      expect(linkActions(link({ status }), NOW)).withContext(status).toEqual(['requestAgain', 'history']);
    }
  });

  it('convite vencido não oferece aceitar — oferece pedir de novo', () => {
    expect(linkActions(invite({ expiresAt: new Date(NOW - 1) }), NOW)).toEqual(['requestAgain', 'history']);
  });

  it('aceitar: equipe "entra na equipe", independente só aceita', () => {
    expect(acceptInviteLabel('ARENA_STAFF')).toBe('Aceitar e entrar na equipe');
    expect(acceptInviteLabel('INDEPENDENT')).toBe('Aceitar convite');
  });
});

describe('professor-links.model — datas', () => {
  it('linha de data do card por estado', () => {
    expect(linkDateLine(invite({ invitedAt: new Date(2026, 9, 20, 9) }), NOW)).toBe('Convite em 20 out');
    expect(linkDateLine(link({ status: 'ACTIVE', approvedAt: new Date(2025, 2, 6) }), NOW)).toBe('Desde mar 2025');
    expect(linkDateLine(link({ status: 'PENDING', requestedAt: new Date(2026, 9, 17) }), NOW)).toBe('Pedido em 17 out');
    expect(linkDateLine(link({ status: 'ENDED', endedAt: new Date(2026, 1, 3) }), NOW)).toBe('Encerrado em fev 2026');
    expect(linkDateLine(link({ status: 'SUSPENDED', suspendedAt: new Date(2026, 9, 2) }), NOW)).toBe('Suspenso em 02 out');
    expect(linkDateLine(link({ status: 'REJECTED', respondedAt: new Date(2025, 11, 1) }), NOW)).toBe('Recusado em 01 dez 2025');
  });

  it('convite vencido mostra quando expirou', () => {
    const due = invite({ expiresAt: new Date(2026, 9, 19, 8) });
    expect(linkDateLine(due, NOW)).toBe('Convite expirou em 19 out');
    expect(linkDetailSubtitle(due, NOW)).toBe('Convite expirado em 19 out 2026');
  });

  it('sem a data da rodada, cai no updatedAt; sem nada, linha vazia', () => {
    expect(linkDateLine(link({ status: 'ACTIVE', updatedAt: new Date(2026, 4, 6) }), NOW)).toBe('Desde mai 2026');
    expect(linkDateLine(link({ status: 'ACTIVE' }), NOW)).toBe('');
  });

  it('"expira em N dias" arredonda para cima e troca para horas no último dia', () => {
    expect(inviteExpiryLabel({ expiresAt: new Date(NOW + 7 * DAY) }, NOW)).toBe('expira em 7 dias');
    expect(inviteExpiryLabel({ expiresAt: new Date(NOW + 6 * DAY + 1) }, NOW)).toBe('expira em 7 dias');
    expect(inviteExpiryLabel({ expiresAt: new Date(NOW + DAY) }, NOW)).toBe('expira em 1 dia');
    expect(inviteExpiryLabel({ expiresAt: new Date(NOW + 5 * 60 * 60 * 1000) }, NOW)).toBe('expira em 5 horas');
    expect(inviteExpiryLabel({ expiresAt: new Date(NOW + 10 * 60 * 1000) }, NOW)).toBe('expira em 1 hora');
    expect(inviteExpiryLabel({ expiresAt: new Date(NOW) }, NOW)).toBeNull();
    expect(inviteExpiryLabel({ expiresAt: null }, NOW)).toBeNull();
  });

  it('subtítulo do detalhe', () => {
    expect(linkDetailSubtitle(link({ status: 'ACTIVE', approvedAt: new Date(2026, 4, 6) }), NOW)).toBe(
      'Vínculo ativo desde 06 mai 2026',
    );
    expect(linkDetailSubtitle(link({ status: 'PENDING', requestedAt: new Date(2026, 9, 17) }), NOW)).toBe(
      'Pedido enviado em 17 out 2026 · aguardando a arena',
    );
    expect(linkDetailSubtitle(invite({ invitedAt: new Date(2026, 9, 20, 10) }), NOW)).toBe(
      'Convite recebido em 20 out 2026 · expira em 7 dias',
    );
    expect(linkDetailSubtitle(link({ status: 'CANCELED', initiatedBy: 'ARENA' }), NOW)).toBe(
      'Convite cancelado pela arena',
    );
  });

  it('"hoje, 10:42" / "ontem" / data', () => {
    const now = new Date(NOW);
    expect(formatRelativeDayTime(new Date(2026, 9, 20, 10, 42), now)).toBe('hoje, 10:42');
    expect(formatRelativeDayTime(new Date(2026, 9, 19, 8, 5), now)).toBe('ontem, 08:05');
    expect(formatRelativeDayTime(new Date(2026, 9, 1, 18, 0), now)).toBe('01 out, 18:00');
  });

  it('motivo acompanha suspensão, recusa e encerramento', () => {
    expect(
      linkReasonLine(link({ status: 'SUSPENDED', suspensionReason: 'Pagamento', suspensionDetails: 'Mensalidade' }), NOW),
    ).toBe('Motivo da suspensão: Pagamento — Mensalidade');
    expect(linkReasonLine(link({ status: 'REJECTED', rejectionReason: 'Sem horário' }), NOW)).toBe('Motivo: Sem horário');
    expect(linkReasonLine(link({ status: 'ACTIVE', endedReason: 'x' }), NOW)).toBeNull();
  });
});

describe('professor-links.model — Minhas arenas', () => {
  it('subtítulo com contagem e plural', () => {
    const links = [
      invite({ id: 'a' }),
      link({ id: 'b', status: 'ACTIVE' }),
      link({ id: 'c', status: 'ACTIVE' }),
      link({ id: 'd', status: 'PENDING' }),
      link({ id: 'e', status: 'ENDED' }),
    ];
    expect(linksSubtitle(links)).toBe('5 vínculos · 2 ativos · mesma conta em todas');
    expect(linksSubtitle([link()])).toBe('1 vínculo · 1 ativo · mesma conta em todas');
    expect(linksSubtitle([])).toContain('mesma conta em todas');
  });

  it('banner do convite por tipo, com quem convidou e o prazo', () => {
    expect(inviteBannerTitle(invite())).toBe('A Arena Sul convidou você para a equipe');
    expect(inviteBannerTitle(invite({ relationshipType: 'INDEPENDENT' }))).toBe(
      'A Arena Sul convidou você como independente',
    );
    expect(inviteBannerSubtitle(invite(), NOW)).toBe('Ricardo Prado · expira em 7 dias');
  });

  it('banner só com convites abertos e não vencidos', () => {
    const open = invite({ id: 'open' });
    const due = invite({ id: 'due', expiresAt: new Date(NOW - 1) });
    expect(openInvites([open, due, link({ id: 'act' })], NOW).map((l) => l.id)).toEqual(['open']);
  });

  it('grade: ativo, suspenso, pedido e por fim os fechados', () => {
    const sorted = sortLinksForList(
      [
        link({ id: 'ended', status: 'ENDED' }),
        link({ id: 'pending', status: 'PENDING' }),
        link({ id: 'susp', status: 'SUSPENDED' }),
        link({ id: 'active', status: 'ACTIVE' }),
      ],
      NOW,
    );
    expect(sorted.map((l) => l.id)).toEqual(['active', 'susp', 'pending', 'ended']);
  });

  it('nota do convite cita as outras arenas em que o professor está', () => {
    const inv = invite({ id: 'sul' });
    const links = [
      inv,
      link({ id: 'cfc', arenaName: 'Arena CFC', status: 'ACTIVE' }),
      link({ id: 'norte', arenaName: 'Arena Norte', status: 'SUSPENDED' }),
      link({ id: 'beach', arenaName: 'Beach Point', status: 'ENDED' }),
    ];
    const note = inviteNote(inv, links);
    expect(note).toContain('Ser da equipe não é vínculo empregatício nem exclusividade');
    expect(note).toContain('Seus vínculos com Arena CFC e Arena Norte continuam iguais.');
    expect(inviteNote(invite({ relationshipType: 'INDEPENDENT' }), [])).toContain(
      'Seus vínculos com outras arenas continuam iguais.',
    );
    expect(otherArenasSentence(['A', 'B', 'C'])).toBe('Seus vínculos com A, B e C continuam iguais.');
  });

  it('sigla da arena como no protótipo', () => {
    expect(arenaInitials('Arena Sul')).toBe('AS');
    expect(arenaInitials('Arena CFC')).toBe('CFC');
    expect(arenaInitials('Lagoa Beach Club')).toBe('LB');
    expect(arenaInitials('Praia Viva Arena')).toBe('PV');
    expect(arenaInitials('Areia')).toBe('AR');
    expect(arenaInitials('')).toBe('AR');
  });
});

describe('professor-links.model — duplicado e erros', () => {
  it('vínculo aberto na lista local responde o duplicado sem ir ao servidor', () => {
    const links = [link({ id: 'x_p', arenaId: 'x', status: 'ENDED' }), link({ id: 'y_p', arenaId: 'y', status: 'PENDING' })];
    expect(openLinkForArena(links, 'x', NOW)).toBeNull();
    expect(openLinkForArena(links, 'y', NOW)?.id).toBe('y_p');
    expect(openLinkForArena([invite({ arenaId: 'z', expiresAt: new Date(NOW - 1) })], 'z', NOW)).toBeNull();
  });

  it('lê o duplicado do HttpsError (already-exists e failed-precondition com details)', () => {
    expect(
      duplicateFromError({
        code: 'functions/already-exists',
        message: 'Você já tem um pedido aqui.',
        details: { linkId: 'a_p', status: 'PENDING', initiatedBy: 'PROFESSOR' },
      }),
    ).toEqual({ linkId: 'a_p', status: 'PENDING', initiatedBy: 'PROFESSOR' });
    expect(
      duplicateFromError({
        code: 'functions/failed-precondition',
        details: { linkId: 'a_p', status: 'INVITED', initiatedBy: 'ARENA' },
      }),
    ).toEqual({ linkId: 'a_p', status: 'INVITED', initiatedBy: 'ARENA' });
  });

  it('erro sem details (arena sem gestor) ou fechado não é duplicado', () => {
    expect(duplicateFromError({ code: 'functions/failed-precondition', message: 'Esta arena ainda não é administrada' })).toBeNull();
    expect(duplicateFromError({ code: 'functions/failed-precondition', details: { linkId: 'a', status: 'EXPIRED' } })).toBeNull();
    expect(duplicateFromError({ code: 'functions/internal', details: { linkId: 'a', status: 'PENDING' } })).toBeNull();
    expect(duplicateFromError(null)).toBeNull();
  });

  it('texto do duplicado por estado (M5)', () => {
    expect(duplicateCopy('PENDING').heading).toBe('Você já tem um pedido aqui');
    expect(duplicateCopy('PENDING').body).toContain('Aguarde a resposta ou cancele o pedido atual para enviar outro.');
    expect(duplicateCopy('PENDING').actionLabel).toBe('Ver pedido atual');
    expect(duplicateCopy('INVITED').heading).toBe('A arena já convidou você');
    expect(duplicateCopy('ACTIVE').actionLabel).toBe('Ver vínculo');
  });

  it('convite vencido ao responder', () => {
    expect(isExpiredInviteError({ code: 'functions/failed-precondition', details: { status: 'EXPIRED' } })).toBeTrue();
    expect(isExpiredInviteError({ code: 'functions/failed-precondition', details: { status: 'ACTIVE' } })).toBeFalse();
  });

  it('mostra a mensagem do servidor; código cru (callable não publicada) vira a genérica', () => {
    const fallback = 'Tente de novo.';
    expect(professorErrorMessage({ code: 'functions/failed-precondition', message: 'Esta arena ainda não é administrada na NexaGO.' }, fallback)).toBe(
      'Esta arena ainda não é administrada na NexaGO.',
    );
    expect(professorErrorMessage({ code: 'functions/not-found', message: 'not-found' }, fallback)).toBe(fallback);
    expect(professorErrorMessage({ code: 'functions/not-found', message: 'NOT FOUND' }, fallback)).toBe(fallback);
    expect(professorErrorMessage({ code: 'functions/not-found', message: 'Vínculo não encontrado.' }, fallback)).toBe(
      'Vínculo não encontrado.',
    );
    expect(professorErrorMessage({ code: 'functions/internal', message: 'INTERNAL' }, fallback)).toBe(fallback);
    expect(professorErrorMessage({ code: 'functions/unauthenticated', message: 'x' }, fallback)).toContain('sessão expirou');
    expect(professorErrorMessage(new Error('rede'), fallback)).toBe(fallback);
  });
});

describe('professor-links.model — histórico', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const sorted = sortEventsDesc([
      event({ id: 'old', createdAt: new Date(2025, 0, 1) }),
      event({ id: 'new', createdAt: new Date(2026, 0, 1) }),
      event({ id: 'none', createdAt: null }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['new', 'old', 'none']);
  });

  it('títulos do ponto de vista do professor', () => {
    const l = link({ relationshipType: 'INDEPENDENT' });
    expect(eventTitle(event({ eventType: 'REQUESTED', metadata: { relationshipType: 'INDEPENDENT' } }), l)).toBe(
      'Você solicitou vínculo · Independente',
    );
    expect(eventTitle(event({ eventType: 'INVITED', actorRole: 'ARENA', metadata: { relationshipType: 'ARENA_STAFF' } }), l)).toBe(
      'Convite recebido · Equipe da arena',
    );
    expect(eventTitle(event({ eventType: 'APPROVED', actorRole: 'ARENA' }), l)).toBe('Solicitação aprovada como Independente');
    expect(eventTitle(event({ eventType: 'SUSPENDED', actorRole: 'ARENA', reason: 'Atraso' }), l)).toBe('Vínculo suspenso · Atraso');
    expect(eventTitle(event({ eventType: 'ENDED', metadata: { side: 'PROFESSOR' } }), l)).toBe('Você encerrou o vínculo');
    expect(eventTitle(event({ eventType: 'ENDED', actorRole: 'ARENA', metadata: { side: 'ARENA' }, reason: 'Fim' }), l)).toBe(
      'Vínculo encerrado pela arena · Fim',
    );
    expect(eventTitle(event({ eventType: 'REJECTED', actorRole: 'PROFESSOR' }), l)).toBe('Você recusou o convite');
    expect(eventTitle(event({ eventType: 'REJECTED', actorRole: 'ARENA' }), l)).toBe('Solicitação não aprovada');
    expect(eventTitle(event({ eventType: 'CANCELED', metadata: { side: 'ARENA' } }), l)).toBe('Convite cancelado');
    expect(eventTitle(event({ eventType: 'CANCELED', metadata: { side: 'PROFESSOR' } }), l)).toBe('Pedido cancelado');
    expect(eventTitle(event({ eventType: 'EXPIRED', actorRole: 'SYSTEM' }), l)).toBe('Convite expirou');
  });

  it('mudança de permissão diz qual ligou e qual saiu', () => {
    const title = eventTitle(
      event({
        eventType: 'PERMISSIONS_CHANGED',
        actorRole: 'ARENA',
        metadata: {
          changed: ['canAppearInArenaProfile', 'canBookCourts'],
          after: { canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false },
        },
      }),
      link(),
    );
    expect(title).toBe('Permissão “Reservar quadras” ligada · Permissão “Aparecer no perfil da arena” removida');
  });

  it('desconto no aluguel: definido, alterado e removido', () => {
    const title = (before: unknown, after: unknown) =>
      eventTitle(event({ eventType: 'COURT_DISCOUNT_CHANGED', actorRole: 'ARENA', metadata: { before, after } }), link());
    expect(title(0, 20)).toBe('Desconto no aluguel: 20%');
    expect(title(10, 20)).toBe('Desconto no aluguel: 10% → 20%');
    expect(title(20, 0)).toBe('Desconto no aluguel removido');
    expect(title(undefined, 15)).toBe('Desconto no aluguel: 15%');
  });

  it('desconto no aluguel com faixa do dia', () => {
    const title = (metadata: Record<string, unknown>) =>
      eventTitle(event({ eventType: 'COURT_DISCOUNT_CHANGED', actorRole: 'ARENA', metadata }), link());
    const none = { beforeStartTime: null, beforeEndTime: null };
    expect(title({ before: 0, after: 20, ...none, afterStartTime: '08:00', afterEndTime: '17:00' })).toBe(
      'Desconto no aluguel: 20% das 08:00 às 17:00',
    );
    expect(title({ before: 20, after: 20, ...none, afterStartTime: '08:00', afterEndTime: '17:00' })).toBe(
      'Desconto no aluguel: 20% → 20% das 08:00 às 17:00',
    );
    expect(title({ before: 20, after: 25, beforeStartTime: '08:00', beforeEndTime: '17:00', afterStartTime: null, afterEndTime: null })).toBe(
      'Desconto no aluguel: 20% das 08:00 às 17:00 → 25%',
    );
  });

  it('linha de baixo: código · autor · data', () => {
    expect(eventMetaLine(event({ eventType: 'APPROVED', actorName: 'Ana Souza', createdAt: new Date(2025, 7, 4) }))).toBe(
      'APPROVED · Ana Souza · 04 ago 2025',
    );
  });
});

describe('professor-links.model — leitura do Firestore', () => {
  const ts = (d: Date) => ({ toDate: () => d });

  it('converte o doc do vínculo (Timestamps, permissões, defaults)', () => {
    const parsed = parseProfessorLink('a_p', {
      arenaId: 'a',
      professorUserId: 'p',
      relationshipType: 'ARENA_STAFF',
      status: 'INVITED',
      initiatedBy: 'ARENA',
      permissions: { canManageOwnLessons: true, canBookCourts: 'sim', canAppearInArenaProfile: true },
      arenaName: ' Arena Sul ',
      expiresAt: ts(new Date(NOW + DAY)),
      invitedByName: 'Ricardo',
    });
    expect(parsed?.status).toBe('INVITED');
    expect(parsed?.arenaName).toBe('Arena Sul');
    expect(parsed?.permissions).toEqual({ ...NO_PERMISSIONS, canManageOwnLessons: true, canAppearInArenaProfile: true });
    expect(parsed?.expiresAt?.getTime()).toBe(NOW + DAY);
    expect(parsed?.message).toBeNull();
  });

  it('chaves das Aulas da arena: só true explícito; vínculo antigo sem a chave = false', () => {
    const parsed = parseProfessorLink('a_p', {
      arenaId: 'a',
      relationshipType: 'ARENA_STAFF',
      status: 'ACTIVE',
      permissions: { canEnrollStudents: true, canScheduleLessons: 'sim', canCancelLessons: false },
    });
    expect(parsed?.permissions.canEnrollStudents).toBeTrue();
    expect(parsed?.permissions.canScheduleLessons).toBeFalse();
    expect(parsed?.permissions.canCancelLessons).toBeFalse();
    const legacy = parseProfessorLink('a_p', { arenaId: 'a', relationshipType: 'ARENA_STAFF', status: 'ACTIVE', permissions: { canBookCourts: true } });
    expect(legacy?.permissions.canEnrollStudents).toBeFalse();
  });

  it('desconto no aluguel: % inteiro de 0 a 90; ausente ou fora da faixa = 0', () => {
    const discount = (raw: unknown) =>
      parseProfessorLink('a_p', { arenaId: 'a', status: 'ACTIVE', courtDiscountPercent: raw })?.courtDiscountPercent;
    expect(discount(20)).toBe(20);
    expect(discount(undefined)).toBe(0);
    expect(discount('20')).toBe(0);
    expect(discount(12.5)).toBe(0);
    expect(discount(95)).toBe(0);
    expect(discount(-1)).toBe(0);
    expect(parseProfessorLinkEvent('e', { eventType: 'COURT_DISCOUNT_CHANGED', metadata: { before: 0, after: 20 } })?.eventType).toBe(
      'COURT_DISCOUNT_CHANGED',
    );
  });

  it('desconto no aluguel: faixa do dia saneada como no servidor', () => {
    const win = (extra: Record<string, unknown>) => {
      const l = parseProfessorLink('a_p', { arenaId: 'a', status: 'ACTIVE', courtDiscountPercent: 20, ...extra })!;
      return [l.courtDiscountStartTime, l.courtDiscountEndTime];
    };
    expect(win({ courtDiscountStartTime: '08:00', courtDiscountEndTime: '17:00' })).toEqual(['08:00', '17:00']);
    expect(win({ courtDiscountStartTime: '18:00', courtDiscountEndTime: '24:00' })).toEqual(['18:00', '24:00']);
    expect(win({})).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '08:00' })).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '17:00', courtDiscountEndTime: '08:00' })).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '25:00', courtDiscountEndTime: '26:00' })).toEqual([null, null]);
    const zero = parseProfessorLink('a_p', {
      arenaId: 'a',
      status: 'ACTIVE',
      courtDiscountPercent: 0,
      courtDiscountStartTime: '08:00',
      courtDiscountEndTime: '17:00',
    })!;
    expect([zero.courtDiscountStartTime, zero.courtDiscountEndTime]).toEqual([null, null]);
  });

  it('linha do desconto no detalhe mostra a faixa do dia', () => {
    expect(courtDiscountLine(link({ courtDiscountPercent: 20, courtDiscountStartTime: '08:00', courtDiscountEndTime: '17:00' }), NOW)).toBe(
      'Desconto no aluguel de quadra: 20% das 08:00 às 17:00',
    );
  });

  it('linha do desconto no detalhe: só com desconto e vínculo aberto (ativo ou suspenso)', () => {
    expect(courtDiscountLine(link({ courtDiscountPercent: 20 }), NOW)).toBe('Desconto no aluguel de quadra: 20%');
    expect(courtDiscountLine(link({ courtDiscountPercent: 20, status: 'SUSPENDED' }), NOW)).toBe('Desconto no aluguel de quadra: 20%');
    expect(courtDiscountLine(link({ courtDiscountPercent: 0 }), NOW)).toBeNull();
    expect(courtDiscountLine(link({ courtDiscountPercent: 20, status: 'ENDED' }), NOW)).toBeNull();
  });

  it('descarta doc sem status conhecido ou sem arena', () => {
    expect(parseProfessorLink('x', { arenaId: 'a', status: 'WHATEVER' })).toBeNull();
    expect(parseProfessorLink('x', { status: 'ACTIVE' })).toBeNull();
    expect(parseProfessorLink('x', undefined)).toBeNull();
  });

  it('converte o evento e ignora tipo desconhecido', () => {
    const parsed = parseProfessorLinkEvent('e', {
      eventType: 'ENDED',
      actorRole: 'PROFESSOR',
      actorName: 'Thiago',
      metadata: { side: 'PROFESSOR' },
      createdAt: ts(new Date(NOW)),
    });
    expect(parsed?.eventType).toBe('ENDED');
    expect(parsed?.metadata).toEqual({ side: 'PROFESSOR' });
    expect(parseProfessorLinkEvent('e', { eventType: 'NOPE' })).toBeNull();
  });
});

describe('professor-links.model — busca de arena', () => {
  const options = [
    { id: '1', name: 'Arena Sul', city: 'Goiânia · GO', logoUrl: null },
    { id: '2', name: 'Praia Viva Arena', city: 'Goiânia · GO', logoUrl: null },
    { id: '3', name: 'Lagoa Beach Club', city: 'Senador Canedo · GO', logoUrl: null },
    { id: '4', name: 'Arena São José', city: 'Anápolis · GO', logoUrl: null },
  ];

  it('pede ao menos 2 letras', () => {
    expect(filterArenaOptions(options, 'a')).toEqual([]);
  });

  it('acha por nome sem acento, nome que começa com o termo primeiro', () => {
    expect(filterArenaOptions(options, 'sao jose').map((o) => o.id)).toEqual(['4']);
    // "Arena São José" < "Arena Sul" (ã ~ a), e "Praia Viva Arena" só contém o termo.
    expect(filterArenaOptions(options, 'arena').map((o) => o.id)).toEqual(['4', '1', '2']);
  });

  it('acha pela cidade também', () => {
    expect(filterArenaOptions(options, 'canedo').map((o) => o.id)).toEqual(['3']);
  });
});
