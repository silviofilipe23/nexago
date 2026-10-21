import { Timestamp, type DocumentSnapshot } from 'firebase/firestore';
import {
  accountLinkState,
  activeKpiSub,
  arenaProfessorEventFromDoc,
  arenaProfessorLinkFromDoc,
  arenaProfessorRequestUrl,
  callableErrorMessage,
  courtDiscountLabel,
  courtDiscountPillLabel,
  courtDiscountTimeInputValue,
  courtDiscountValueLabel,
  dayMonthLabel,
  defaultProfessorPermissions,
  detailSubtitle,
  displayStatus,
  effectivePermissions,
  eventMetaLine,
  eventTitle,
  filterProfessorRows,
  inviteDaysLeft,
  inviteKpiSub,
  isInviteExpired,
  linkActions,
  parseCourtDiscountInput,
  parseCourtDiscountWindowInput,
  pendingRequests,
  permissionAllowedForType,
  permissionGroupsFor,
  permissionsCell,
  permissionsForType,
  permissionsStateNote,
  professorKpis,
  resendInviteInput,
  sortEventsDesc,
  sortProfessorLinks,
  statusDateLine,
  statusGroupOf,
  type ArenaProfessorEvent,
  type ArenaProfessorLink,
} from './arena-professor.model';

// 20 out 2026, 12:00 local — os rótulos usam o calendário local, como a tela.
const NOW = new Date(2026, 9, 20, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function fakeDoc(id: string, data: Record<string, unknown>): DocumentSnapshot {
  return { id, data: () => data } as unknown as DocumentSnapshot;
}

function makeLink(overrides: Partial<ArenaProfessorLink> = {}): ArenaProfessorLink {
  return {
    id: 'a1_u1',
    arenaId: 'a1',
    professorUserId: 'u1',
    relationshipType: 'INDEPENDENT',
    status: 'ACTIVE',
    initiatedBy: 'PROFESSOR',
    permissions: {
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: false,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
      canBookRecurring: false,
    },
    courtDiscountPercent: 0,
    courtDiscountStartTime: null,
    courtDiscountEndTime: null,
    message: null,
    cycle: 1,
    professorName: 'Marcos Lima',
    professorPhotoUrl: null,
    professorModalities: ['Vôlei de praia'],
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

function makeEvent(overrides: Partial<ArenaProfessorEvent> = {}): ArenaProfessorEvent {
  return {
    id: 'e1',
    eventType: 'APPROVED',
    actorName: 'Ana Souza',
    actorRole: 'ARENA',
    reason: null,
    metadata: {},
    createdAt: new Date(2025, 7, 4, 10, 0),
    ...overrides,
  };
}

const openInvite = (overrides: Partial<ArenaProfessorLink> = {}) =>
  makeLink({
    status: 'INVITED',
    initiatedBy: 'ARENA',
    invitedAt: new Date(2026, 9, 18, 9, 0),
    expiresAt: new Date(NOW + 5 * DAY),
    ...overrides,
  });

describe('arena-professor.model · status e permissões', () => {
  it('padrão por tipo: equipe liga as três de base, independente fica fora do perfil; Aulas da arena desligadas nos dois', () => {
    expect(defaultProfessorPermissions('ARENA_STAFF')).toEqual({
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: true,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
      canBookRecurring: false,
    });
    expect(defaultProfessorPermissions('INDEPENDENT')).toEqual({
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: false,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
      canBookRecurring: false,
    });
  });

  const allOn = {
    canManageOwnLessons: true,
    canBookCourts: true,
    canAppearInArenaProfile: true,
    canEnrollStudents: true,
    canScheduleLessons: true,
    canCancelLessons: true,
    canBookRecurring: true,
  };

  it('Aulas da arena: efetivas só na equipe ativa; independente nunca, mesmo com a chave gravada', () => {
    const staff = effectivePermissions(makeLink({ relationshipType: 'ARENA_STAFF', permissions: allOn }));
    expect(staff).toEqual({ ...allOn, canBookRecurring: false });
    const independent = effectivePermissions(makeLink({ relationshipType: 'INDEPENDENT', permissions: allOn }));
    expect(independent.canEnrollStudents).toBeFalse();
    expect(independent.canScheduleLessons).toBeFalse();
    expect(independent.canCancelLessons).toBeFalse();
    expect(independent.canBookCourts).toBeTrue();
    expect(independent.canBookRecurring).toBeTrue();
    const suspendedStaff = effectivePermissions(makeLink({ relationshipType: 'ARENA_STAFF', status: 'SUSPENDED', permissions: allOn }));
    expect(suspendedStaff.canEnrollStudents).toBeFalse();
  });

  it('nunca envia true das chaves da equipe para independente, nem do horário fixo para a equipe', () => {
    expect(permissionsForType(allOn, 'INDEPENDENT')).toEqual({
      ...allOn,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
    });
    expect(permissionsForType(allOn, 'ARENA_STAFF')).toEqual({ ...allOn, canBookRecurring: false });
    const independentInvite = openInvite({ relationshipType: 'INDEPENDENT', permissions: allOn });
    expect(resendInviteInput(independentInvite).permissions.canEnrollStudents).toBeFalse();
  });

  it('toggle das Aulas da arena só para equipe: grupo e permissão por tipo', () => {
    const staffGroups = permissionGroupsFor('ARENA_STAFF');
    expect(staffGroups.map((g) => g.title)).toEqual([null, 'Aulas da arena']);
    expect(staffGroups[1].items.map((i) => i.key)).toEqual(['canEnrollStudents', 'canScheduleLessons', 'canCancelLessons']);
    expect(staffGroups[1].items.map((i) => i.title)).toEqual(['Matricular alunos', 'Agendar aulas e encaixes', 'Cancelar aulas e avisar alunos']);
    expect(staffGroups[1].note).toBe('Só para professor da equipe');
    const independentGroups = permissionGroupsFor('INDEPENDENT');
    expect(independentGroups.map((g) => g.title)).toEqual([null, 'Turma própria']);
    expect(independentGroups[0].items.map((i) => i.key)).toEqual(['canManageOwnLessons', 'canBookCourts', 'canAppearInArenaProfile']);
    expect(independentGroups[1].items.map((i) => i.key)).toEqual(['canBookRecurring']);
    expect(independentGroups[1].items[0].title).toBe('Horário fixo (turma própria)');
    expect(independentGroups[1].items[0].sub).toBe(
      'Pode reservar a quadra toda semana para uma turma dele. A reserva aparece nos horários fixos da arena.',
    );
    expect(independentGroups[1].note).toBe('Só para professor independente');
    expect(permissionAllowedForType('canBookRecurring', 'INDEPENDENT')).toBeTrue();
    expect(permissionAllowedForType('canBookRecurring', 'ARENA_STAFF')).toBeFalse();
    expect(permissionAllowedForType('canEnrollStudents', 'INDEPENDENT')).toBeFalse();
    expect(permissionAllowedForType('canEnrollStudents', 'ARENA_STAFF')).toBeTrue();
    expect(permissionAllowedForType('canBookCourts', 'INDEPENDENT')).toBeTrue();
  });

  it('convite vencido vira "expirado" na tela antes de o servidor marcar', () => {
    const expired = openInvite({ expiresAt: new Date(NOW - 1) });
    expect(isInviteExpired(expired, NOW)).toBeTrue();
    expect(displayStatus(expired, NOW)).toBe('EXPIRED');
    // No limite exato também vence (servidor: `expiresAt <= now`).
    expect(isInviteExpired(openInvite({ expiresAt: new Date(NOW) }), NOW)).toBeTrue();
    expect(displayStatus(openInvite(), NOW)).toBe('INVITED');
    // Só convite vence: pedido com data passada continua pedido.
    expect(isInviteExpired(makeLink({ status: 'PENDING', expiresAt: new Date(NOW - DAY) }), NOW)).toBeFalse();
    expect(isInviteExpired(openInvite({ expiresAt: null }), NOW)).toBeFalse();
  });

  it('permissões efetivas só com ACTIVE; suspenso revoga sem apagar a configuração', () => {
    const active = makeLink();
    expect(effectivePermissions(active)).toEqual(active.permissions);
    const suspended = makeLink({ status: 'SUSPENDED' });
    expect(effectivePermissions(suspended)).toEqual({
      canManageOwnLessons: false,
      canBookCourts: false,
      canAppearInArenaProfile: false,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
      canBookRecurring: false,
    });
    expect(suspended.permissions.canBookCourts).toBeTrue();
  });

  it('coluna de permissões: pílulas no ativo, textos fora dele', () => {
    const cell = permissionsCell(makeLink(), NOW);
    expect(cell.kind).toBe('pills');
    if (cell.kind === 'pills') {
      expect(cell.items.map((i) => `${i.label}:${i.on}`)).toEqual(['Aulas:true', 'Quadras:true', 'Perfil:false']);
    }
    expect(permissionsCell(openInvite(), NOW)).toEqual({ kind: 'text', text: 'após o aceite' });
    expect(permissionsCell(makeLink({ status: 'PENDING' }), NOW)).toEqual({ kind: 'text', text: 'após a aprovação' });
    expect(permissionsCell(makeLink({ status: 'SUSPENDED' }), NOW)).toEqual({ kind: 'text', text: 'revogadas' });
    expect(permissionsCell(openInvite({ expiresAt: new Date(NOW - 1) }), NOW)).toEqual({ kind: 'text', text: 'revogadas' });
  });

  it('nota do card de permissões por estado', () => {
    expect(permissionsStateNote(makeLink(), NOW)).toBeNull();
    expect(permissionsStateNote(makeLink({ status: 'SUSPENDED' }), NOW)).toContain('reativar');
    expect(permissionsStateNote(openInvite(), NOW)).toContain('aceitar');
    expect(permissionsStateNote(makeLink({ status: 'ENDED' }), NOW)).toContain('revogadas');
  });
});

describe('arena-professor.model · datas', () => {
  it('dia/mês com o ano só fora do ano corrente', () => {
    expect(dayMonthLabel(new Date(2026, 9, 18), NOW)).toBe('18 out');
    expect(dayMonthLabel(new Date(2025, 2, 3), NOW)).toBe('03 mar 2025');
  });

  it('dias até vencer o convite arredondam para cima e nunca ficam abaixo de 1', () => {
    expect(inviteDaysLeft(new Date(NOW + 6 * DAY - 1000), NOW)).toBe(6);
    expect(inviteDaysLeft(new Date(NOW + 2 * 60 * 60 * 1000), NOW)).toBe(1);
    expect(inviteDaysLeft(new Date(NOW - DAY), NOW)).toBe(1);
  });

  it('linha de data da lista no formato do protótipo', () => {
    expect(statusDateLine(makeLink({ approvedAt: new Date(2025, 2, 10) }), NOW)).toBe('desde mar 2025');
    expect(statusDateLine(openInvite(), NOW)).toBe('convite 18 out');
    expect(statusDateLine(makeLink({ status: 'PENDING', requestedAt: new Date(2026, 9, 19, 21, 14) }), NOW)).toBe('pedido 19 out');
    expect(statusDateLine(makeLink({ status: 'SUSPENDED', suspendedAt: new Date(2026, 9, 2) }), NOW)).toBe('suspenso 02 out');
    expect(statusDateLine(makeLink({ status: 'ENDED', endedAt: new Date(2026, 6, 15) }), NOW)).toBe('encerrado jul 2026');
    expect(statusDateLine(openInvite({ expiresAt: new Date(2026, 9, 11) }), NOW)).toBe('expirou 11 out');
    expect(statusDateLine(makeLink({ status: 'REJECTED', respondedAt: null }), NOW)).toBe('');
  });

  it('subtítulo do detalhe', () => {
    expect(detailSubtitle(makeLink({ approvedAt: new Date(2025, 7, 4) }), NOW)).toBe('Vínculo desde 04 ago 2025');
    expect(detailSubtitle(openInvite({ expiresAt: new Date(NOW + 6 * DAY) }), NOW)).toBe('Convite enviado em 18 out 2026 · expira em 6 dias');
    expect(detailSubtitle(openInvite({ expiresAt: new Date(NOW + DAY) }), NOW)).toBe('Convite enviado em 18 out 2026 · expira em 1 dia');
    expect(detailSubtitle(makeLink({ status: 'SUSPENDED', suspendedAt: new Date(2026, 9, 2) }), NOW)).toBe('Suspenso desde 02 out 2026');
    expect(detailSubtitle(makeLink({ status: 'CANCELED' }), NOW)).toBe('Cancelado em');
  });
});

describe('arena-professor.model · lista', () => {
  const links: ArenaProfessorLink[] = [
    makeLink({ id: 'l1', professorUserId: 'u1', professorName: 'Thiago Mendes', relationshipType: 'ARENA_STAFF' }),
    makeLink({ id: 'l2', professorUserId: 'u2', professorName: 'Juliana Rocha', relationshipType: 'ARENA_STAFF' }),
    makeLink({ id: 'l3', professorUserId: 'u3', professorName: 'Marcos Lima' }),
    makeLink({ id: 'l4', professorUserId: 'u4', professorName: 'Gustavo Reis', status: 'SUSPENDED' }),
    openInvite({ id: 'l5', professorUserId: 'u5', professorName: 'Lucas Ferraz', relationshipType: 'ARENA_STAFF', expiresAt: new Date(NOW + 6 * DAY) }),
    openInvite({ id: 'l6', professorUserId: 'u6', professorName: 'Otávio Prado', expiresAt: new Date(NOW + 2 * DAY) }),
    openInvite({ id: 'l7', professorUserId: 'u7', professorName: 'Ana Expirada', expiresAt: new Date(NOW - DAY) }),
    makeLink({ id: 'l8', professorUserId: 'u8', professorName: 'Rafael Cunha', status: 'PENDING', requestedAt: new Date(2026, 9, 19) }),
    makeLink({ id: 'l9', professorUserId: 'u9', professorName: 'Bianca Leal', status: 'PENDING', requestedAt: new Date(2026, 9, 17) }),
    makeLink({ id: 'l10', professorUserId: 'u10', professorName: 'Renata Álves', relationshipType: 'ARENA_STAFF', status: 'ENDED' }),
    makeLink({ id: 'l11', professorUserId: 'u11', professorName: 'Caio Recusado', status: 'REJECTED' }),
  ];

  it('KPIs: ativos por tipo, suspensos, pedidos e convites em aberto (vencido não conta)', () => {
    const kpis = professorKpis(links, NOW);
    expect(kpis).toEqual({
      staffActive: 2,
      staffSuspended: 0,
      independentActive: 1,
      independentSuspended: 1,
      pending: 2,
      invitesOpen: 2,
      nextInviteDaysLeft: 2,
    });
    expect(activeKpiSub(kpis.staffActive, kpis.staffSuspended)).toBe('ativos');
    expect(activeKpiSub(kpis.independentActive, kpis.independentSuspended)).toBe('ativo · 1 suspenso');
    expect(inviteKpiSub(kpis)).toBe('o próximo expira em 2 dias');
    expect(inviteKpiSub({ invitesOpen: 1, nextInviteDaysLeft: 6 })).toBe('expira em 6 dias');
    expect(inviteKpiSub({ invitesOpen: 0, nextInviteDaysLeft: null })).toBe('nenhum em aberto');
  });

  it('grupos do filtro: recusado, cancelado, encerrado e expirado são "encerrados"', () => {
    expect(statusGroupOf('ACTIVE')).toBe('active');
    expect(statusGroupOf('INVITED')).toBe('invites');
    expect(statusGroupOf('SUSPENDED')).toBe('suspended');
    expect(statusGroupOf('PENDING')).toBe('pending');
    for (const s of ['REJECTED', 'CANCELED', 'ENDED', 'EXPIRED'] as const) expect(statusGroupOf(s)).toBe('closed');
  });

  it('tabela tira os pedidos e ordena ativos, convites, suspensos e fechados', () => {
    const rows = filterProfessorRows(links, { type: 'all', status: 'all', term: '' }, NOW);
    expect(rows.map((r) => r.id)).toEqual(['l2', 'l3', 'l1', 'l5', 'l6', 'l4', 'l7', 'l11', 'l10']);
  });

  it('filtra por tipo, por grupo e por nome sem acento', () => {
    const ids = (filter: Parameters<typeof filterProfessorRows>[1]) => filterProfessorRows(links, filter, NOW).map((r) => r.id);
    expect(ids({ type: 'ARENA_STAFF', status: 'all', term: '' })).toEqual(['l2', 'l1', 'l5', 'l10']);
    expect(ids({ type: 'all', status: 'invites', term: '' })).toEqual(['l5', 'l6']);
    expect(ids({ type: 'all', status: 'closed', term: '' })).toEqual(['l7', 'l11', 'l10']);
    expect(ids({ type: 'INDEPENDENT', status: 'suspended', term: '' })).toEqual(['l4']);
    expect(ids({ type: 'all', status: 'all', term: '  renata alves ' })).toEqual(['l10']);
    expect(ids({ type: 'all', status: 'all', term: 'OTAVIO' })).toEqual(['l6']);
    // Pedido não aparece na tabela nem buscando pelo nome — fica no card lateral.
    expect(ids({ type: 'all', status: 'all', term: 'rafael' })).toEqual([]);
  });

  it('pedidos pendentes, mais antigos primeiro', () => {
    expect(pendingRequests(links).map((l) => l.id)).toEqual(['l9', 'l8']);
  });

  it('ordem geral põe pedidos no topo', () => {
    expect(sortProfessorLinks(links, NOW).slice(0, 2).map((l) => l.id)).toEqual(['l9', 'l8']);
  });
});

describe('arena-professor.model · convite e ações', () => {
  const links = [
    openInvite({ professorUserId: 'invited' }),
    openInvite({ professorUserId: 'expired', expiresAt: new Date(NOW - 1) }),
    makeLink({ professorUserId: 'requested', status: 'PENDING' }),
    makeLink({ professorUserId: 'active' }),
    makeLink({ professorUserId: 'suspended', status: 'SUSPENDED' }),
    makeLink({ professorUserId: 'ended', status: 'ENDED' }),
  ];

  it('situação da conta na busca do convite', () => {
    expect(accountLinkState(links, 'new', NOW)).toBe('available');
    expect(accountLinkState(links, 'invited', NOW)).toBe('invited');
    expect(accountLinkState(links, 'expired', NOW)).toBe('available');
    expect(accountLinkState(links, 'requested', NOW)).toBe('requested');
    expect(accountLinkState(links, 'active', NOW)).toBe('linked');
    expect(accountLinkState(links, 'suspended', NOW)).toBe('linked');
    expect(accountLinkState(links, 'ended', NOW)).toBe('available');
  });

  it('ações por estado', () => {
    expect(linkActions(makeLink(), NOW)).toEqual(['suspend', 'end']);
    expect(linkActions(makeLink({ status: 'SUSPENDED' }), NOW)).toEqual(['reactivate', 'end']);
    expect(linkActions(makeLink({ status: 'PENDING' }), NOW)).toEqual(['analyze']);
    expect(linkActions(openInvite(), NOW)).toEqual(['cancelInvite']);
    expect(linkActions(openInvite({ expiresAt: new Date(NOW - 1) }), NOW)).toEqual(['resendInvite', 'cancelInvite']);
    expect(linkActions(makeLink({ status: 'EXPIRED', initiatedBy: 'ARENA' }), NOW)).toEqual(['resendInvite']);
    expect(linkActions(makeLink({ status: 'EXPIRED', initiatedBy: 'PROFESSOR' }), NOW)).toEqual([]);
    for (const status of ['ENDED', 'REJECTED', 'CANCELED'] as const) expect(linkActions(makeLink({ status }), NOW)).toEqual([]);
  });

  it('reenviar repete professor, tipo, permissões e mensagem', () => {
    const link = openInvite({ relationshipType: 'ARENA_STAFF', message: 'Vem pra equipe!' });
    const input = resendInviteInput(link);
    expect(input).toEqual({
      arenaId: 'a1',
      professorUserId: 'u1',
      relationshipType: 'ARENA_STAFF',
      permissions: link.permissions,
      message: 'Vem pra equipe!',
    });
    expect(input.permissions).not.toBe(link.permissions);
  });

  it('link da página da arena no portal do atleta, onde o professor pede o vínculo', () => {
    expect(arenaProfessorRequestUrl('https://atleta.nexago.com.br/', 'arena 1')).toBe('https://atleta.nexago.com.br/reservar/arena%201');
  });
});

describe('arena-professor.model · histórico', () => {
  const link = makeLink();

  it('títulos da tabela da spec', () => {
    expect(eventTitle(makeEvent({ eventType: 'INVITED', metadata: { relationshipType: 'ARENA_STAFF' } }), link)).toBe('Convite enviado · Equipe da arena');
    expect(eventTitle(makeEvent({ eventType: 'REQUESTED', actorName: 'Marcos Lima', actorRole: 'PROFESSOR' }), link)).toBe(
      'Marcos solicitou vínculo · Independente',
    );
    expect(eventTitle(makeEvent({ eventType: 'APPROVED' }), link)).toBe('Solicitação aprovada como Independente');
    expect(eventTitle(makeEvent({ eventType: 'SUSPENDED', reason: 'Pendência de pagamento' }), link)).toBe('Vínculo suspenso · Pendência de pagamento');
    expect(eventTitle(makeEvent({ eventType: 'REJECTED' }), link)).toBe('Recusado');
    expect(eventTitle(makeEvent({ eventType: 'ENDED', reason: 'Mudou de cidade' }), link)).toBe('Vínculo encerrado · Mudou de cidade');
    expect(eventTitle(makeEvent({ eventType: 'CANCELED', metadata: { side: 'ARENA' } }), link)).toBe('Convite cancelado');
    expect(eventTitle(makeEvent({ eventType: 'CANCELED', metadata: { side: 'PROFESSOR' } }), link)).toBe('Pedido cancelado');
    expect(eventTitle(makeEvent({ eventType: 'EXPIRED' }), link)).toBe('Convite expirou');
  });

  it('permissão ligada/removida a partir de metadata.changed + metadata.after', () => {
    const one = makeEvent({
      eventType: 'PERMISSIONS_CHANGED',
      metadata: { changed: ['canAppearInArenaProfile'], after: { canAppearInArenaProfile: false } },
    });
    expect(eventTitle(one, link)).toBe('Permissão “Aparecer no perfil da arena” removida');
    const two = makeEvent({
      eventType: 'PERMISSIONS_CHANGED',
      metadata: { changed: ['canBookCourts', 'canManageOwnLessons'], after: { canBookCourts: true, canManageOwnLessons: false } },
    });
    expect(eventTitle(two, link)).toBe('Permissões alteradas · “Reservar quadras” ligada · “Gerenciar as próprias aulas” removida');
  });

  it('linha de baixo: tipo · quem · data', () => {
    expect(eventMetaLine(makeEvent())).toBe('APPROVED · Ana Souza · 04 ago 2025');
    expect(eventMetaLine(makeEvent({ eventType: 'EXPIRED', actorRole: 'SYSTEM', actorName: 'NexaGO' }))).toBe('EXPIRED · Sistema · 04 ago 2025');
    expect(eventMetaLine(makeEvent({ actorRole: 'ADMIN', createdAt: null }))).toBe('APPROVED · Ana Souza · suporte');
  });

  it('mais recente primeiro', () => {
    const events = [
      makeEvent({ id: 'old', createdAt: new Date(2025, 0, 1) }),
      makeEvent({ id: 'new', createdAt: new Date(2026, 0, 1) }),
      makeEvent({ id: 'none', createdAt: null }),
    ];
    expect(sortEventsDesc(events).map((e) => e.id)).toEqual(['new', 'old', 'none']);
  });
});

describe('arena-professor.model · parse e erros', () => {
  it('lê o doc do vínculo, com padrão do tipo para permissão ausente', () => {
    const link = arenaProfessorLinkFromDoc(
      fakeDoc('a1_u1', {
        arenaId: 'a1',
        professorUserId: 'u1',
        relationshipType: 'ARENA_STAFF',
        status: 'INVITED',
        initiatedBy: 'ARENA',
        permissions: { canBookCourts: false, extra: true },
        professorName: '  Lucas Ferraz ',
        professorModalities: ['Beach Tennis', '', 3],
        expiresAt: Timestamp.fromMillis(NOW + DAY),
        message: '   ',
      }),
    );
    expect(link.permissions).toEqual({
      canManageOwnLessons: true,
      canBookCourts: false,
      canAppearInArenaProfile: true,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
      canBookRecurring: false,
    });
    expect(link.professorName).toBe('Lucas Ferraz');
    expect(link.professorModalities).toEqual(['Beach Tennis']);
    expect(link.expiresAt?.getTime()).toBe(NOW + DAY);
    expect(link.message).toBeNull();
    expect(link.approvedAt).toBeNull();
  });

  it('chaves das Aulas da arena: só true explícito liga; vínculo antigo sem a chave = false', () => {
    const doc = (permissions: Record<string, unknown>) =>
      arenaProfessorLinkFromDoc(fakeDoc('a1_u1', { relationshipType: 'ARENA_STAFF', status: 'ACTIVE', permissions }));
    const on = doc({ canEnrollStudents: true, canScheduleLessons: false, canCancelLessons: 'sim' });
    expect(on.permissions.canEnrollStudents).toBeTrue();
    expect(on.permissions.canScheduleLessons).toBeFalse();
    expect(on.permissions.canCancelLessons).toBeFalse();
    const legacy = doc({ canManageOwnLessons: true });
    expect(legacy.permissions.canEnrollStudents).toBeFalse();
    expect(effectivePermissions(legacy).canScheduleLessons).toBeFalse();
  });

  it('horário fixo: só true explícito liga; vale só no independente ativo', () => {
    const doc = (relationshipType: string, permissions: Record<string, unknown>) =>
      arenaProfessorLinkFromDoc(fakeDoc('a1_u1', { relationshipType, status: 'ACTIVE', permissions }));
    expect(doc('INDEPENDENT', { canBookRecurring: true }).permissions.canBookRecurring).toBeTrue();
    expect(doc('INDEPENDENT', { canBookRecurring: 'sim' }).permissions.canBookRecurring).toBeFalse();
    expect(doc('INDEPENDENT', {}).permissions.canBookRecurring).toBeFalse();
    expect(effectivePermissions(doc('ARENA_STAFF', { canBookRecurring: true })).canBookRecurring).toBeFalse();
    const suspended = makeLink({ status: 'SUSPENDED', permissions: { ...makeLink().permissions, canBookRecurring: true } });
    expect(effectivePermissions(suspended).canBookRecurring).toBeFalse();
  });

  it('histórico nomeia as permissões novas', () => {
    const event = makeEvent({ eventType: 'PERMISSIONS_CHANGED', metadata: { changed: ['canEnrollStudents'], after: { canEnrollStudents: true } } });
    expect(eventTitle(event, makeLink())).toBe('Permissão “Matricular alunos” ligada');
  });

  it('desconto no aluguel: lê o % do vínculo; ausente, quebrado ou fora da faixa = 0', () => {
    const doc = (extra: Record<string, unknown>) =>
      arenaProfessorLinkFromDoc(fakeDoc('a1_u1', { relationshipType: 'INDEPENDENT', status: 'ACTIVE', ...extra }));
    expect(doc({ courtDiscountPercent: 20 }).courtDiscountPercent).toBe(20);
    expect(doc({}).courtDiscountPercent).toBe(0);
    expect(doc({ courtDiscountPercent: '20' }).courtDiscountPercent).toBe(0);
    expect(doc({ courtDiscountPercent: 12.5 }).courtDiscountPercent).toBe(0);
    expect(doc({ courtDiscountPercent: 95 }).courtDiscountPercent).toBe(0);
    expect(doc({ courtDiscountPercent: -5 }).courtDiscountPercent).toBe(0);
  });

  it('desconto no aluguel: rótulo e campo de edição (inteiro 0–90, vazio = 0)', () => {
    expect(courtDiscountLabel(20)).toBe('20%');
    expect(courtDiscountLabel(0)).toBe('Sem desconto');
    expect(parseCourtDiscountInput('20')).toBe(20);
    expect(parseCourtDiscountInput(' 15% ')).toBe(15);
    expect(parseCourtDiscountInput('')).toBe(0);
    expect(parseCourtDiscountInput('90')).toBe(90);
    expect(parseCourtDiscountInput('91')).toBeNull();
    expect(parseCourtDiscountInput('12,5')).toBeNull();
    expect(parseCourtDiscountInput('-1')).toBeNull();
    expect(parseCourtDiscountInput('abc')).toBeNull();
  });

  it('histórico do desconto no aluguel: definido, alterado e removido', () => {
    const link = makeLink();
    const event = (before: unknown, after: unknown) =>
      eventTitle(makeEvent({ eventType: 'COURT_DISCOUNT_CHANGED', metadata: { before, after } }), link);
    expect(event(0, 20)).toBe('Desconto no aluguel: 20%');
    expect(event(10, 20)).toBe('Desconto no aluguel: 10% → 20%');
    expect(event(20, 0)).toBe('Desconto no aluguel removido');
    expect(event(undefined, 15)).toBe('Desconto no aluguel: 15%');
    expect(arenaProfessorEventFromDoc(fakeDoc('e3', { eventType: 'COURT_DISCOUNT_CHANGED', metadata: { before: 0, after: 20 } }))?.eventType).toBe(
      'COURT_DISCOUNT_CHANGED',
    );
  });

  it('desconto no aluguel: faixa do dia saneada como no servidor', () => {
    const doc = (extra: Record<string, unknown>) =>
      arenaProfessorLinkFromDoc(fakeDoc('a1_u1', { relationshipType: 'INDEPENDENT', status: 'ACTIVE', courtDiscountPercent: 20, ...extra }));
    const win = (extra: Record<string, unknown>) => {
      const l = doc(extra);
      return [l.courtDiscountStartTime, l.courtDiscountEndTime];
    };
    expect(win({ courtDiscountStartTime: '08:00', courtDiscountEndTime: '17:00' })).toEqual(['08:00', '17:00']);
    expect(win({ courtDiscountStartTime: '18:00', courtDiscountEndTime: '24:00' })).toEqual(['18:00', '24:00']);
    expect(win({})).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '08:00', courtDiscountEndTime: null })).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '17:00', courtDiscountEndTime: '08:00' })).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '8h', courtDiscountEndTime: '17:00' })).toEqual([null, null]);
    expect(win({ courtDiscountStartTime: '24:00', courtDiscountEndTime: '24:00' })).toEqual([null, null]);
    // Sem desconto não tem faixa.
    const zero = arenaProfessorLinkFromDoc(
      fakeDoc('a1_u1', { courtDiscountPercent: 0, courtDiscountStartTime: '08:00', courtDiscountEndTime: '17:00' }),
    );
    expect([zero.courtDiscountStartTime, zero.courtDiscountEndTime]).toEqual([null, null]);
  });

  it('desconto no aluguel: valor do detalhe e pílula da lista com e sem faixa', () => {
    const allDay = { startTime: null, endTime: null };
    const window = { startTime: '08:00', endTime: '17:00' };
    expect(courtDiscountValueLabel(20, allDay)).toBe('20% · o dia todo');
    expect(courtDiscountValueLabel(20, window)).toBe('20% · das 08:00 às 17:00');
    expect(courtDiscountValueLabel(0, window)).toBe('Sem desconto');
    expect(courtDiscountPillLabel(20, allDay)).toBe('−20% quadra');
    expect(courtDiscountPillLabel(20, window)).toBe('−20% quadra 08–17h');
    expect(courtDiscountPillLabel(15, { startTime: '08:30', endTime: '24:00' })).toBe('−15% quadra 08:30–24h');
  });

  it('desconto no aluguel: horário do editor (início antes do fim; fim 00:00 = meia-noite)', () => {
    expect(parseCourtDiscountWindowInput(true, '', '')).toEqual({ startTime: null, endTime: null });
    expect(parseCourtDiscountWindowInput(true, '17:00', '08:00')).toEqual({ startTime: null, endTime: null });
    expect(parseCourtDiscountWindowInput(false, '08:00', '17:00')).toEqual({ startTime: '08:00', endTime: '17:00' });
    expect(parseCourtDiscountWindowInput(false, '18:00', '00:00')).toEqual({ startTime: '18:00', endTime: '24:00' });
    expect(parseCourtDiscountWindowInput(false, '', '17:00')).toBeNull();
    expect(parseCourtDiscountWindowInput(false, '08:00', '')).toBeNull();
    expect(parseCourtDiscountWindowInput(false, '17:00', '08:00')).toBeNull();
    expect(parseCourtDiscountWindowInput(false, '08:00', '08:00')).toBeNull();
    expect(courtDiscountTimeInputValue('24:00')).toBe('00:00');
    expect(courtDiscountTimeInputValue('08:00')).toBe('08:00');
    expect(courtDiscountTimeInputValue(null)).toBe('');
  });

  it('histórico do desconto no aluguel: com faixa do dia', () => {
    const link = makeLink();
    const event = (metadata: Record<string, unknown>) => eventTitle(makeEvent({ eventType: 'COURT_DISCOUNT_CHANGED', metadata }), link);
    const w = { afterStartTime: '08:00', afterEndTime: '17:00' };
    expect(event({ before: 0, after: 20, beforeStartTime: null, beforeEndTime: null, ...w })).toBe('Desconto no aluguel: 20% das 08:00 às 17:00');
    expect(event({ before: 20, after: 20, beforeStartTime: null, beforeEndTime: null, ...w })).toBe(
      'Desconto no aluguel: 20% → 20% das 08:00 às 17:00',
    );
    expect(
      event({ before: 20, after: 20, beforeStartTime: '08:00', beforeEndTime: '17:00', afterStartTime: null, afterEndTime: null }),
    ).toBe('Desconto no aluguel: 20% das 08:00 às 17:00 → 20%');
    expect(event({ before: 20, after: 0, beforeStartTime: '08:00', beforeEndTime: '17:00', afterStartTime: null, afterEndTime: null })).toBe(
      'Desconto no aluguel removido',
    );
  });

  it('evento de tipo desconhecido fica fora da linha do tempo', () => {
    expect(arenaProfessorEventFromDoc(fakeDoc('e1', { eventType: 'SOMETHING_NEW' }))).toBeNull();
    const event = arenaProfessorEventFromDoc(
      fakeDoc('e2', { eventType: 'ACCEPTED', actorName: 'Lucas', actorRole: 'PROFESSOR', createdAt: Timestamp.fromMillis(NOW), metadata: [] }),
    );
    expect(event?.eventType).toBe('ACCEPTED');
    expect(event?.metadata).toEqual({});
    expect(event?.createdAt?.getTime()).toBe(NOW);
  });

  it('mensagem do callable: copy do servidor passa, código cru vira texto genérico', () => {
    const fail = (code: string, message: string) => Object.assign(new Error(message), { code });
    expect(callableErrorMessage(fail('functions/already-exists', 'Este professor já está vinculado à arena.'), 'x')).toBe(
      'Este professor já está vinculado à arena.',
    );
    expect(callableErrorMessage(fail('functions/not-found', 'not-found'), 'genérico')).toBe('genérico');
    expect(callableErrorMessage(fail('functions/not-found', 'NOT FOUND'), 'genérico')).toBe('genérico');
    expect(callableErrorMessage(fail('functions/internal', 'internal'), 'genérico')).toBe('genérico');
    expect(callableErrorMessage(fail('functions/not-found', 'Vínculo não encontrado.'), 'genérico')).toBe('Vínculo não encontrado.');
    expect(callableErrorMessage('boom', 'genérico')).toBe('genérico');
  });
});
