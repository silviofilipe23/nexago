import 'arena_professor_link.dart';

/// Regras puras do lado do professor (rótulos, datas, ações por estado).
/// Copy e cores seguem o protótipo `vc-atoms.jsx` e a tabela da spec
/// `docs/superpowers/specs/2026-10-20-vinculos-professor-arena-design.md`.

/// `${arenaId}_${professorUserId}` — o cliente monta o id para ler o vínculo
/// com uma arena específica (página da arena).
String arenaProfessorLinkIdFor(String arenaId, String professorUserId) =>
    '${arenaId}_$professorUserId';

/// Convite com o prazo vencido. O servidor só grava `EXPIRED` quando alguém
/// toca no vínculo; até lá a tela trata como expirado.
bool isProfessorInviteExpired(ArenaProfessorLink link, DateTime now) {
  if (link.status != ArenaProfessorLinkStatus.invited) return false;
  final expiresAt = link.expiresAt;
  return expiresAt != null && !expiresAt.isAfter(now);
}

/// Status que a tela mostra: o gravado, com o convite vencido como `expired`.
ArenaProfessorLinkStatus effectiveProfessorLinkStatus(
  ArenaProfessorLink link,
  DateTime now,
) =>
    isProfessorInviteExpired(link, now)
        ? ArenaProfessorLinkStatus.expired
        : link.status;

/// Rótulo do status para o PROFESSOR (a arena vê "Convite enviado" etc.).
String professorLinkStatusLabel(ArenaProfessorLinkStatus status) =>
    switch (status) {
      ArenaProfessorLinkStatus.invited => 'Convite recebido',
      ArenaProfessorLinkStatus.pending => 'Aguardando a arena',
      ArenaProfessorLinkStatus.active => 'Ativo',
      ArenaProfessorLinkStatus.rejected => 'Recusado',
      ArenaProfessorLinkStatus.suspended => 'Suspenso',
      ArenaProfessorLinkStatus.ended => 'Encerrado',
      ArenaProfessorLinkStatus.canceled => 'Cancelado',
      ArenaProfessorLinkStatus.expired => 'Convite expirado',
    };

/// Tom do status: azul (convite), amarelo (aguardando), verde (ativo),
/// vermelho (suspenso) e apagado (fechados).
enum ProfessorLinkTone { invited, pending, active, danger, muted }

ProfessorLinkTone professorLinkStatusTone(ArenaProfessorLinkStatus status) =>
    switch (status) {
      ArenaProfessorLinkStatus.invited => ProfessorLinkTone.invited,
      ArenaProfessorLinkStatus.pending => ProfessorLinkTone.pending,
      ArenaProfessorLinkStatus.active => ProfessorLinkTone.active,
      ArenaProfessorLinkStatus.suspended => ProfessorLinkTone.danger,
      ArenaProfessorLinkStatus.rejected ||
      ArenaProfessorLinkStatus.ended ||
      ArenaProfessorLinkStatus.canceled ||
      ArenaProfessorLinkStatus.expired =>
        ProfessorLinkTone.muted,
    };

String professorLinkTypeLabel(ArenaProfessorLinkType type) => switch (type) {
      ArenaProfessorLinkType.arenaStaff => 'Equipe da arena',
      ArenaProfessorLinkType.independent => 'Independente',
    };

String professorLinkTypeDescription(ArenaProfessorLinkType type) =>
    switch (type) {
      ArenaProfessorLinkType.arenaStaff =>
        'Integra a rede de professores da arena',
      ArenaProfessorLinkType.independent =>
        'Autônomo, usa a estrutura para os próprios alunos',
    };

class ProfessorPermissionInfo {
  const ProfessorPermissionInfo({
    required this.key,
    required this.title,
    required this.description,
    required this.shortLabel,
  });

  final ArenaProfessorPermissionKey key;
  final String title;
  final String description;

  /// Rótulo curto da lista (Aulas / Quadras / Perfil).
  final String shortLabel;
}

/// Título do grupo das permissões só de equipe.
const professorArenaLessonsGroupTitle = 'Aulas da arena';

/// Por que o grupo não vale para o independente.
const professorArenaStaffOnlyHint = 'Só para professor da equipe da arena';

const professorPermissionCatalog = [
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canManageOwnLessons,
    title: 'Gerenciar as próprias aulas',
    description: 'Criar aulas e turmas, fazer chamada dos seus alunos',
    shortLabel: 'Aulas',
  ),
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canBookCourts,
    title: 'Reservar quadras',
    description: 'Reservar horários conforme regras e preços da arena',
    shortLabel: 'Quadras',
  ),
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canAppearInArenaProfile,
    title: 'Aparecer no perfil da arena',
    description: 'Listado em “Professores” na página pública',
    shortLabel: 'Perfil',
  ),
];

/// Ações nas Aulas da arena em nome dela — só equipe, desligadas por padrão.
const professorArenaLessonsPermissionCatalog = [
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canEnrollStudents,
    title: 'Matricular alunos',
    description: 'Nas próprias turmas, com os planos da arena; mover de turma '
        'e lista de espera',
    shortLabel: 'Matrículas',
  ),
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canScheduleLessons,
    title: 'Agendar aulas e encaixes',
    description: 'Reposição, experimental e aula avulsa na quadra que a arena '
        'definir, usando o pacote do aluno',
    shortLabel: 'Agenda',
  ),
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canCancelLessons,
    title: 'Cancelar aulas e avisar alunos',
    description: 'Cancelar aulas das próprias turmas com aviso aos alunos',
    shortLabel: 'Cancelamentos',
  ),
];

/// Título do grupo das permissões só do independente.
const professorIndependentGroupTitle = 'Turma própria';

/// Horário fixo de quadra para turma própria (B10) — só independente,
/// desligada por padrão.
const professorIndependentPermissionCatalog = [
  ProfessorPermissionInfo(
    key: ArenaProfessorPermissionKey.canBookRecurring,
    title: 'Horário fixo (turma própria)',
    description: 'Pode reservar a quadra toda semana para uma turma dele. A '
        'reserva aparece nos horários fixos da arena.',
    shortLabel: 'Horário fixo',
  ),
];

ProfessorPermissionInfo professorPermissionInfo(
  ArenaProfessorPermissionKey key,
) =>
    [
      ...professorPermissionCatalog,
      ...professorArenaLessonsPermissionCatalog,
      ...professorIndependentPermissionCatalog,
    ].firstWhere((info) => info.key == key);

/// O que a configuração vale para o [type]: no independente, as chaves só de
/// equipe nunca valem; na equipe, as só do independente (espelho do
/// servidor).
ArenaProfessorPermissions professorPermissionsForType(
  ArenaProfessorPermissions permissions,
  ArenaProfessorLinkType type,
) =>
    type == ArenaProfessorLinkType.arenaStaff
        ? permissions.withoutIndependentOnly()
        : permissions.withoutArenaStaffOnly();

/// O que o professor pode fazer AGORA: nada fora de `ACTIVE` (suspensão
/// revoga sem apagar a configuração); as Aulas da arena só na equipe.
ArenaProfessorPermissions effectiveProfessorPermissions(
  ArenaProfessorLink link,
) =>
    link.status == ArenaProfessorLinkStatus.active
        ? professorPermissionsForType(link.permissions, link.type)
        : ArenaProfessorPermissions.none;

/// Permissões da lista "Suas permissões": no convite em aberto, a proposta da
/// arena (é o que está sendo aceito); nos demais, as efetivas.
ArenaProfessorPermissions professorPermissionsToShow(
  ArenaProfessorLink link,
  DateTime now,
) =>
    effectiveProfessorLinkStatus(link, now) == ArenaProfessorLinkStatus.invited
        ? professorPermissionsForType(link.permissions, link.type)
        : effectiveProfessorPermissions(link);

/// Explicação abaixo das permissões; `null` quando valem (ativo).
String? professorPermissionsNote(ArenaProfessorLinkStatus status) =>
    switch (status) {
      ArenaProfessorLinkStatus.active => null,
      ArenaProfessorLinkStatus.invited =>
        'O que a arena propõe — vale depois do seu aceite.',
      ArenaProfessorLinkStatus.pending =>
        'Nada vale antes da aprovação: a arena define o que libera ao aprovar.',
      ArenaProfessorLinkStatus.suspended =>
        'Suspensas enquanto o vínculo estiver suspenso. Voltam se a arena '
            'reativar.',
      ArenaProfessorLinkStatus.rejected ||
      ArenaProfessorLinkStatus.ended ||
      ArenaProfessorLinkStatus.canceled ||
      ArenaProfessorLinkStatus.expired =>
        'Sem permissões: o vínculo não está ativo.',
    };

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/// Mês abreviado sem ponto, igual ao portal ("out", não "out.").
const _months = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/// "20 out".
String professorLinkDayMonth(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')} ${_months[date.month - 1]}';

/// "mar 2025".
String professorLinkMonthYear(DateTime date) =>
    '${_months[date.month - 1]} ${date.year}';

/// "20 out" no ano corrente, "20 out 2025" fora dele.
String professorLinkShortDate(DateTime date, DateTime now) =>
    date.year == now.year
        ? professorLinkDayMonth(date)
        : '${professorLinkDayMonth(date)} ${date.year}';

/// "hoje 10:42", "ontem 10:42" ou "20 out · 10:42".
String professorLinkMoment(DateTime date, DateTime now) {
  final time = '${date.hour.toString().padLeft(2, '0')}:'
      '${date.minute.toString().padLeft(2, '0')}';
  final day = DateTime(date.year, date.month, date.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(day).inDays;
  if (diff == 0) return 'hoje $time';
  if (diff == 1) return 'ontem $time';
  return '${professorLinkShortDate(date, now)} · $time';
}

/// Linha de data do card: "Convite em 20 out", "Desde mar 2025",
/// "Pedido em 17 out", "Encerrado em fev 2026". `null` sem data gravada.
String? professorLinkDateLine(ArenaProfessorLink link, DateTime now) {
  final status = effectiveProfessorLinkStatus(link, now);
  String short(DateTime d) => professorLinkShortDate(d, now);
  final (DateTime? date, String Function(DateTime) format) = switch (status) {
    ArenaProfessorLinkStatus.invited => (
        link.invitedAt,
        (d) => 'Convite em ${short(d)}',
      ),
    ArenaProfessorLinkStatus.pending => (
        link.requestedAt,
        (d) => 'Pedido em ${short(d)}',
      ),
    ArenaProfessorLinkStatus.active => (
        link.approvedAt,
        (d) => 'Desde ${professorLinkMonthYear(d)}',
      ),
    ArenaProfessorLinkStatus.suspended => (
        link.suspendedAt,
        (d) => 'Suspenso em ${short(d)}',
      ),
    ArenaProfessorLinkStatus.ended => (
        link.endedAt,
        (d) => 'Encerrado em ${professorLinkMonthYear(d)}',
      ),
    ArenaProfessorLinkStatus.rejected => (
        link.respondedAt,
        (d) => 'Recusado em ${short(d)}',
      ),
    ArenaProfessorLinkStatus.canceled => (
        link.canceledAt,
        (d) => 'Cancelado em ${short(d)}',
      ),
    ArenaProfessorLinkStatus.expired => (
        link.expiresAt,
        (d) => 'Expirou em ${short(d)}',
      ),
  };
  final resolved = date ?? link.updatedAt;
  return resolved == null ? null : format(resolved);
}

/// Subtítulo do detalhe (M6): "VÍNCULO ATIVO · DESDE MAI 2026".
String professorLinkHeaderSubtitle(ArenaProfessorLink link, DateTime now) {
  final status = effectiveProfessorLinkStatus(link, now);
  final head = switch (status) {
    ArenaProfessorLinkStatus.invited => 'Convite recebido',
    ArenaProfessorLinkStatus.pending => 'Aguardando a arena',
    ArenaProfessorLinkStatus.active => 'Vínculo ativo',
    ArenaProfessorLinkStatus.suspended => 'Vínculo suspenso',
    ArenaProfessorLinkStatus.ended => 'Vínculo encerrado',
    ArenaProfessorLinkStatus.rejected => 'Recusado',
    ArenaProfessorLinkStatus.canceled => 'Cancelado',
    ArenaProfessorLinkStatus.expired => 'Convite expirado',
  };
  String short(DateTime d) => professorLinkShortDate(d, now);
  final tail = switch (status) {
    ArenaProfessorLinkStatus.invited => _map(link.invitedAt, short),
    ArenaProfessorLinkStatus.pending =>
      _map(link.requestedAt, (d) => 'pedido em ${short(d)}'),
    ArenaProfessorLinkStatus.active =>
      _map(link.approvedAt, (d) => 'desde ${professorLinkMonthYear(d)}'),
    ArenaProfessorLinkStatus.suspended =>
      _map(link.suspendedAt, (d) => 'desde ${short(d)}'),
    ArenaProfessorLinkStatus.ended =>
      _map(link.endedAt, (d) => 'em ${professorLinkMonthYear(d)}'),
    ArenaProfessorLinkStatus.rejected =>
      _map(link.respondedAt, (d) => 'em ${short(d)}'),
    ArenaProfessorLinkStatus.canceled =>
      _map(link.canceledAt, (d) => 'em ${short(d)}'),
    ArenaProfessorLinkStatus.expired =>
      _map(link.expiresAt, (d) => 'em ${short(d)}'),
  };
  return (tail == null ? head : '$head · $tail').toUpperCase();
}

String? _map(DateTime? date, String Function(DateTime) format) =>
    date == null ? null : format(date);

/// "Expira em 7 dias" (convite em aberto); `null` fora disso.
String? professorInviteExpiryLine(ArenaProfessorLink link, DateTime now) {
  if (effectiveProfessorLinkStatus(link, now) !=
      ArenaProfessorLinkStatus.invited) {
    return null;
  }
  final expiresAt = link.expiresAt;
  if (expiresAt == null) return null;
  final hours = expiresAt.difference(now).inHours;
  if (hours < 1) return 'Expira em menos de 1 hora';
  if (hours < 24) return 'Expira em $hours h';
  final days = (hours / 24).ceil();
  return days == 1 ? 'Expira em 1 dia' : 'Expira em $days dias';
}

// ---------------------------------------------------------------------------
// Minhas arenas (M1)
// ---------------------------------------------------------------------------

/// "Arena Sul quer você na equipe".
String professorInviteHeadline(ArenaProfessorLink link) => switch (link.type) {
      ArenaProfessorLinkType.arenaStaff =>
        '${link.arenaName} quer você na equipe',
      ArenaProfessorLinkType.independent =>
        '${link.arenaName} convidou você como independente',
    };

/// Subtítulo da lista: "2 ATIVAS · 1 CONVITE".
String professorLinksSummary(List<ArenaProfessorLink> links, DateTime now) {
  var active = 0;
  var invites = 0;
  var pending = 0;
  var suspended = 0;
  for (final link in links) {
    switch (effectiveProfessorLinkStatus(link, now)) {
      case ArenaProfessorLinkStatus.active:
        active++;
      case ArenaProfessorLinkStatus.invited:
        invites++;
      case ArenaProfessorLinkStatus.pending:
        pending++;
      case ArenaProfessorLinkStatus.suspended:
        suspended++;
      default:
        break;
    }
  }
  final parts = [
    if (active > 0) '$active ${active == 1 ? 'ATIVA' : 'ATIVAS'}',
    if (invites > 0) '$invites ${invites == 1 ? 'CONVITE' : 'CONVITES'}',
    if (pending > 0) '$pending AGUARDANDO',
    if (suspended > 0)
      '$suspended ${suspended == 1 ? 'SUSPENSA' : 'SUSPENSAS'}',
  ];
  if (parts.isNotEmpty) return parts.join(' · ');
  return links.isEmpty ? 'ÁREA DO PROFESSOR' : 'NENHUM VÍNCULO ATIVO';
}

/// Convites em aberto (cards azuis do topo), o mais recente primeiro.
List<ArenaProfessorLink> professorOpenInvites(
  List<ArenaProfessorLink> links,
  DateTime now,
) {
  final invites = [
    for (final link in links)
      if (effectiveProfessorLinkStatus(link, now) ==
          ArenaProfessorLinkStatus.invited)
        link,
  ];
  invites.sort((a, b) => _compareDesc(a.invitedAt, b.invitedAt));
  return invites;
}

/// Demais vínculos (linhas): ativos, suspensos, aguardando e, por último, os
/// fechados — cada grupo do mais recente para o mais antigo.
List<ArenaProfessorLink> professorLinkRows(
  List<ArenaProfessorLink> links,
  DateTime now,
) {
  final rows = [
    for (final link in links)
      if (effectiveProfessorLinkStatus(link, now) !=
          ArenaProfessorLinkStatus.invited)
        link,
  ];
  int rank(ArenaProfessorLink link) =>
      switch (effectiveProfessorLinkStatus(link, now)) {
        ArenaProfessorLinkStatus.active => 0,
        ArenaProfessorLinkStatus.suspended => 1,
        ArenaProfessorLinkStatus.pending => 2,
        _ => 3,
      };
  rows.sort((a, b) {
    final byRank = rank(a).compareTo(rank(b));
    if (byRank != 0) return byRank;
    return _compareDesc(a.updatedAt, b.updatedAt);
  });
  return rows;
}

int _compareDesc(DateTime? a, DateTime? b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.compareTo(a);
}

// ---------------------------------------------------------------------------
// Ações por estado
// ---------------------------------------------------------------------------

enum ProfessorLinkAction {
  /// Convite em aberto: aceitar ou recusar.
  respondInvite,

  /// Pedido aguardando a arena: só quem pediu cancela.
  cancelRequest,

  /// Ativo ou suspenso: encerramento imediato pelo professor.
  end,

  /// Fechado (recusado, encerrado, cancelado, expirado): nova rodada.
  requestAgain,
}

ProfessorLinkAction professorLinkAction(
  ArenaProfessorLink link,
  DateTime now,
) =>
    switch (effectiveProfessorLinkStatus(link, now)) {
      ArenaProfessorLinkStatus.invited => ProfessorLinkAction.respondInvite,
      ArenaProfessorLinkStatus.pending => ProfessorLinkAction.cancelRequest,
      ArenaProfessorLinkStatus.active ||
      ArenaProfessorLinkStatus.suspended =>
        ProfessorLinkAction.end,
      ArenaProfessorLinkStatus.rejected ||
      ArenaProfessorLinkStatus.ended ||
      ArenaProfessorLinkStatus.canceled ||
      ArenaProfessorLinkStatus.expired =>
        ProfessorLinkAction.requestAgain,
    };

/// Linha "fechada" da lista (apagada, como no protótipo).
bool isClosedProfessorLink(ArenaProfessorLink link, DateTime now) =>
    !effectiveProfessorLinkStatus(link, now).isOpen;

/// Nota do detalhe (M6) explicando o estado; `null` no vínculo ativo.
({String text, ProfessorLinkTone tone})? professorLinkStatusNote(
  ArenaProfessorLink link,
  DateTime now,
) {
  String why(String? reason) {
    if (reason == null || reason.isEmpty) return '';
    final end = RegExp(r'[.!?…]$').hasMatch(reason) ? '' : '.';
    return ' Motivo: $reason$end';
  }

  final byArena = link.initiatedBy == ArenaProfessorSide.arena;
  switch (effectiveProfessorLinkStatus(link, now)) {
    case ArenaProfessorLinkStatus.active:
      return null;
    case ArenaProfessorLinkStatus.invited:
      final expiry = professorInviteExpiryLine(link, now);
      return (
        text: '${expiry == null ? 'Convite em aberto' : expiry}. Responda para '
            'o vínculo começar a valer.',
        tone: ProfessorLinkTone.invited,
      );
    case ArenaProfessorLinkStatus.pending:
      return (
        text: 'A arena ainda não respondeu. Você recebe uma notificação com a '
            'resposta.',
        tone: ProfessorLinkTone.pending,
      );
    case ArenaProfessorLinkStatus.suspended:
      final details = link.suspensionDetails;
      final reason = [
        if (link.suspensionReason != null) link.suspensionReason!,
        if (details != null) details,
      ].join(' — ');
      return (
        text:
            'A arena suspendeu o vínculo.${why(reason)} Suas permissões voltam '
            'se ela reativar.',
        tone: ProfessorLinkTone.danger,
      );
    case ArenaProfessorLinkStatus.rejected:
      return (
        text: byArena
            ? 'Você recusou o convite.${why(link.rejectionReason)}'
            : 'A arena não aprovou o pedido.${why(link.rejectionReason)}',
        tone: ProfessorLinkTone.muted,
      );
    case ArenaProfessorLinkStatus.ended:
      return (
        text: link.endedBySide == ArenaProfessorSide.professor
            ? 'Você encerrou o vínculo.${why(link.endedReason)}'
            : 'A arena encerrou o vínculo.${why(link.endedReason)}',
        tone: ProfessorLinkTone.muted,
      );
    case ArenaProfessorLinkStatus.canceled:
      return (
        text:
            byArena ? 'A arena cancelou o convite.' : 'Você cancelou o pedido.',
        tone: ProfessorLinkTone.muted,
      );
    case ArenaProfessorLinkStatus.expired:
      return (
        text:
            'O convite expirou sem resposta. Você pode pedir vínculo de novo.',
        tone: ProfessorLinkTone.muted,
      );
  }
}

/// Subtítulo da entrada "Minhas arenas" nos ajustes.
String professorLinksEntrySubtitle(
  List<ArenaProfessorLink> links,
  DateTime now,
) {
  final invites = professorOpenInvites(links, now).length;
  if (invites > 0) {
    return invites == 1
        ? '1 convite de arena para responder'
        : '$invites convites de arena para responder';
  }
  final statuses = [
    for (final link in links) effectiveProfessorLinkStatus(link, now),
  ];
  final active = statuses.where((s) => s == ArenaProfessorLinkStatus.active);
  if (active.isNotEmpty) {
    return active.length == 1
        ? '1 vínculo ativo'
        : '${active.length} vínculos ativos';
  }
  if (statuses.contains(ArenaProfessorLinkStatus.pending)) {
    return 'Pedido aguardando a arena';
  }
  return 'Vínculos com as arenas onde você dá aula';
}

// ---------------------------------------------------------------------------
// Histórico (M6)
// ---------------------------------------------------------------------------

/// Título da linha do histórico, do ponto de vista do professor.
String professorLinkEventTitle(
  ArenaProfessorLinkEvent event, {
  required ArenaProfessorLinkType linkType,
}) {
  final byProfessor = event.actorRole == 'PROFESSOR';
  final type = professorLinkTypeLabel(
    _eventType(event) ?? linkType,
  );
  final reason = event.reason;
  String withReason(String text) =>
      reason == null || reason.isEmpty ? text : '$text · $reason';
  return switch (event.eventType) {
    'INVITED' => 'Convite da arena · $type',
    'REQUESTED' => 'Você solicitou vínculo · $type',
    'ACCEPTED' => 'Você aceitou o convite',
    'REJECTED' => byProfessor
        ? withReason('Você recusou o convite')
        : withReason('Solicitação recusada'),
    'APPROVED' => 'Solicitação aprovada como $type',
    'SUSPENDED' => withReason('Vínculo suspenso'),
    'REACTIVATED' => 'Vínculo reativado',
    'ENDED' => byProfessor
        ? withReason('Você encerrou o vínculo')
        : withReason('Vínculo encerrado pela arena'),
    'PERMISSIONS_CHANGED' => _permissionsChangedTitle(event.metadata),
    'CANCELED' =>
      byProfessor ? 'Você cancelou o pedido' : 'Convite cancelado pela arena',
    'EXPIRED' => 'Convite expirou',
    _ => event.eventType,
  };
}

ArenaProfessorLinkType? _eventType(ArenaProfessorLinkEvent event) {
  final raw = event.metadata['relationshipType'];
  return raw is String ? ArenaProfessorLinkType.parse(raw) : null;
}

/// "Permissão “Reservar quadras” removida"; mais de uma mudança vira a lista
/// curta ("Permissões alteradas: Aulas ligada, Perfil removida").
String _permissionsChangedTitle(Map<String, Object?> metadata) {
  final changedRaw = metadata['changed'];
  final afterRaw = metadata['after'];
  final after = ArenaProfessorPermissions.fromMap(afterRaw);
  final changed = <ArenaProfessorPermissionKey>[
    if (changedRaw is List)
      for (final raw in changedRaw)
        if (ArenaProfessorPermissionKey.tryParse(raw) case final key?) key,
  ];
  if (changed.isEmpty) return 'Permissões alteradas';
  String state(ArenaProfessorPermissionKey key) =>
      after.valueOf(key) ? 'ligada' : 'removida';
  if (changed.length == 1) {
    final key = changed.single;
    return 'Permissão “${professorPermissionInfo(key).title}” ${state(key)}';
  }
  final parts = [
    for (final key in changed)
      '${professorPermissionInfo(key).shortLabel} ${state(key)}',
  ];
  return 'Permissões alteradas: ${parts.join(', ')}';
}

/// Linha de baixo: "APPROVED · Carla N. · 06 mai".
String professorLinkEventMeta(
  ArenaProfessorLinkEvent event, {
  required String viewerUid,
  required DateTime now,
}) {
  final actor = event.actorRole == 'SYSTEM'
      ? 'NexaGO'
      : event.actorUserId.isNotEmpty && event.actorUserId == viewerUid
          ? 'Você'
          : event.actorName.isNotEmpty
              ? event.actorName
              : 'Arena';
  final date = event.createdAt;
  return [
    event.eventType,
    actor,
    if (date != null) professorLinkShortDate(date, now),
  ].join(' · ');
}

/// Histórico do mais recente para o mais antigo (o cliente ordena).
List<ArenaProfessorLinkEvent> sortProfessorLinkEvents(
  List<ArenaProfessorLinkEvent> events,
) =>
    [...events]..sort((a, b) => _compareDesc(a.createdAt, b.createdAt));

// ---------------------------------------------------------------------------
// Pedido duplicado (M5)
// ---------------------------------------------------------------------------

/// Vínculo em aberto que recusou um novo pedido: `already-exists` (ou
/// `failed-precondition`, quando a arena já convidou) com
/// `details: {linkId, status, initiatedBy}`.
class ProfessorLinkDuplicate {
  const ProfessorLinkDuplicate({
    required this.linkId,
    required this.status,
    this.initiatedBy,
  });

  final String linkId;
  final ArenaProfessorLinkStatus status;
  final ArenaProfessorSide? initiatedBy;

  String get title => switch (status) {
        ArenaProfessorLinkStatus.pending => 'Você já tem um pedido aqui',
        ArenaProfessorLinkStatus.invited => 'A arena já convidou você',
        _ => 'Você já tem vínculo',
      };

  String get body => switch (status) {
        ArenaProfessorLinkStatus.pending =>
          'Só é possível ter um vínculo em aberto por arena. Aguarde a resposta '
              'ou cancele o pedido atual para enviar outro.',
        ArenaProfessorLinkStatus.invited =>
          'Só é possível ter um vínculo em aberto por arena. Responda o convite '
              'que a arena mandou para você.',
        _ =>
          'Só é possível ter um vínculo em aberto por arena. Para mudar o tipo, '
              'encerre o vínculo atual e peça de novo.',
      };

  String get primaryLabel => switch (status) {
        ArenaProfessorLinkStatus.pending => 'Ver pedido atual',
        ArenaProfessorLinkStatus.invited => 'Ver convite',
        _ => 'Ver vínculo',
      };
}

/// `null` quando o erro não é de duplicado (ex.: arena sem gestor, convite
/// vencido ao responder — `details.status = EXPIRED`, que não é aberto).
ProfessorLinkDuplicate? professorLinkDuplicateFrom({
  required String code,
  Object? details,
}) {
  final normalized = code.trim().toLowerCase().replaceAll('_', '-');
  if (normalized != 'already-exists' && normalized != 'failed-precondition') {
    return null;
  }
  if (details is! Map) return null;
  final linkId = details['linkId'];
  final status = ArenaProfessorLinkStatus.tryParse(details['status']);
  if (linkId is! String || linkId.trim().isEmpty) return null;
  if (status == null || !status.isOpen) return null;
  return ProfessorLinkDuplicate(
    linkId: linkId.trim(),
    status: status,
    initiatedBy: ArenaProfessorSide.tryParse(details['initiatedBy']),
  );
}

// ---------------------------------------------------------------------------
// Diversos
// ---------------------------------------------------------------------------

const _initialsStopWords = {'de', 'da', 'do', 'das', 'dos', 'e', '&'};

/// Marca da arena sem logo: iniciais das duas primeiras palavras ("AS").
String professorArenaInitials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where(
          (w) => w.isNotEmpty && !_initialsStopWords.contains(w.toLowerCase()))
      .toList();
  if (words.isEmpty) return 'A';
  return words
      .take(2)
      .map((w) => String.fromCharCode(w.runes.first).toUpperCase())
      .join();
}

/// "Professores" da página da arena: equipe primeiro, depois por nome.
List<PublicArenaProfessor> sortPublicArenaProfessors(
  List<PublicArenaProfessor> professors,
) {
  int rank(PublicArenaProfessor p) =>
      p.type == ArenaProfessorLinkType.arenaStaff ? 0 : 1;
  return [...professors]..sort((a, b) {
      final byRank = rank(a).compareTo(rank(b));
      if (byRank != 0) return byRank;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
}
