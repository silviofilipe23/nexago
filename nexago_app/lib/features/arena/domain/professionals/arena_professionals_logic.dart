import '../../../../core/deep_link/app_domains.dart';
import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/search/search_keywords.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/domain/professor_link_rules.dart';

/// Regras puras do lado da ARENA nos vínculos com professores (menu
/// Profissionais). Espelho do portal (`frontend/projects/arena/.../
/// profissionais/arena-professor.model.ts`) adaptado ao celular; a copy segue a
/// spec `docs/superpowers/specs/2026-10-20-vinculos-professor-arena-design.md`.
/// A autoridade das transições é o servidor — aqui só rótulos, contas e o que a
/// tela oferece em cada estado.

/// Mesmo prazo do servidor (`PROFESSOR_INVITE_TTL_MS`). Só para o texto.
const arenaProfessorInviteTtlDays = 7;

/// Motivos da suspensão (protótipo A5). Vão como `reason` — o servidor exige um.
const arenaProfessorSuspensionReasons = [
  'Pendência de pagamento',
  'Descumprimento de regras',
  'Pedido do professor',
  'Outro',
];

/// Rótulo do status para a ARENA (o professor vê "Convite recebido" etc.).
String arenaProfessorStatusLabel(ArenaProfessorLinkStatus status) =>
    switch (status) {
      ArenaProfessorLinkStatus.invited => 'Convite enviado',
      ArenaProfessorLinkStatus.pending => 'Aguardando aprovação',
      ArenaProfessorLinkStatus.active => 'Ativo',
      ArenaProfessorLinkStatus.rejected => 'Recusado',
      ArenaProfessorLinkStatus.suspended => 'Suspenso',
      ArenaProfessorLinkStatus.ended => 'Encerrado',
      ArenaProfessorLinkStatus.canceled => 'Cancelado',
      ArenaProfessorLinkStatus.expired => 'Convite expirado',
    };

// ---------------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------------

/// Equipe da arena: as três. Independente: aulas e quadras, fora da página
/// pública (espelho de `defaultArenaProfessorPermissions` no servidor). As
/// Aulas da arena (matricular/agendar/cancelar) começam desligadas nos dois.
ArenaProfessorPermissions defaultArenaProfessorPermissions(
  ArenaProfessorLinkType type,
) =>
    ArenaProfessorPermissions(
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: type == ArenaProfessorLinkType.arenaStaff,
    );

ArenaProfessorPermissions arenaProfessorPermissionsWith(
  ArenaProfessorPermissions permissions,
  ArenaProfessorPermissionKey key,
  bool value,
) =>
    permissions.withValue(key, value);

/// Grupos de interruptores que a arena vê para o [type]: o das Aulas da arena
/// só existe na equipe e o da Turma própria (horário fixo) só no
/// independente (o servidor recusa ligar no tipo errado).
List<({String? title, List<ProfessorPermissionInfo> items})>
    arenaProfessorPermissionGroups(ArenaProfessorLinkType type) => [
          (title: null, items: professorPermissionCatalog),
          if (type == ArenaProfessorLinkType.arenaStaff)
            (
              title: professorArenaLessonsGroupTitle,
              items: professorArenaLessonsPermissionCatalog,
            ),
          if (type == ArenaProfessorLinkType.independent)
            (
              title: professorIndependentGroupTitle,
              items: professorIndependentPermissionCatalog,
            ),
        ];

/// O que vai no convite/aprovação/reenvio: nunca `true` de chave só de
/// equipe num vínculo independente, nem de chave só do independente num de
/// equipe (o servidor recusaria o pedido inteiro).
ArenaProfessorPermissions arenaProfessorPermissionsToSend(
  ArenaProfessorPermissions permissions,
  ArenaProfessorLinkType type,
) =>
    professorPermissionsForType(permissions, type);

/// Corpo `permissions` das callables (chaves do servidor).
Map<String, bool> arenaProfessorPermissionsToMap(
  ArenaProfessorPermissions permissions,
) =>
    {
      for (final key in ArenaProfessorPermissionKey.values)
        key.wire: permissions.valueOf(key),
    };

/// Só vínculo ativo ou suspenso tem permissões ajustáveis
/// (`updateArenaProfessorPermissions`).
bool arenaProfessorPermissionsEditable(ArenaProfessorLinkStatus status) =>
    status == ArenaProfessorLinkStatus.active ||
    status == ArenaProfessorLinkStatus.suspended;

/// Desconto no aluguel de quadra: a callable só aceita vínculo `ACTIVE` ou
/// `SUSPENDED` (mesma janela das permissões).
bool arenaProfessorCourtDiscountEditable(ArenaProfessorLinkStatus status) =>
    arenaProfessorPermissionsEditable(status);

/// "20%" ou "Sem desconto".
String arenaProfessorCourtDiscountValueLabel(int percent) =>
    percent > 0 ? '$percent%' : 'Sem desconto';

/// Texto digitado → inteiro 0–90; `null` quando inválido (vazio conta como 0).
int? parseArenaProfessorCourtDiscountInput(String raw) {
  final text = raw.trim().replaceAll('%', '').trim();
  if (text.isEmpty) return 0;
  final value = int.tryParse(text);
  if (value == null || value < 0 || value > kProfessorCourtDiscountMaxPercent) {
    return null;
  }
  return value;
}

/// Snackbar depois de gravar.
String arenaProfessorCourtDiscountSavedMessage(int percent) => percent > 0
    ? 'Desconto de $percent% no aluguel salvo. O professor foi avisado.'
    : 'Desconto no aluguel removido. O professor foi avisado.';

/// O que o card de permissões do detalhe mostra: fechado = o que vale (nada);
/// aberto = a configuração, que é o que o toggle edita (no convite e no
/// pedido, a proposta).
ArenaProfessorPermissions arenaProfessorPermissionsShown(
  ArenaProfessorLink link,
  DateTime now,
) =>
    effectiveProfessorLinkStatus(link, now).isOpen
        ? professorPermissionsForType(link.permissions, link.type)
        : ArenaProfessorPermissions.none;

/// Aviso do card de permissões quando elas não estão valendo; `null` no ativo.
String? arenaProfessorPermissionsNote(ArenaProfessorLink link, DateTime now) =>
    switch (effectiveProfessorLinkStatus(link, now)) {
      ArenaProfessorLinkStatus.active => null,
      ArenaProfessorLinkStatus.suspended =>
        'Vínculo suspenso: nada vale até reativar. O que você ajustar agora '
            'passa a valer na reativação.',
      ArenaProfessorLinkStatus.invited =>
        'Proposta do convite — só passa a valer quando o professor aceitar.',
      ArenaProfessorLinkStatus.pending =>
        'Você define as permissões ao aprovar a solicitação.',
      ArenaProfessorLinkStatus.rejected ||
      ArenaProfessorLinkStatus.ended ||
      ArenaProfessorLinkStatus.canceled ||
      ArenaProfessorLinkStatus.expired =>
        'Vínculo fechado — permissões revogadas.',
    };

/// Linha de permissões da lista: pílulas só com vínculo ativo; fora dele, um
/// texto curto ("após o aceite", "revogadas").
({
  List<({ArenaProfessorPermissionKey key, String label, bool on})>? pills,
  String? text
}) arenaProfessorPermissionsCell(
  ArenaProfessorLink link,
  DateTime now,
) {
  final status = effectiveProfessorLinkStatus(link, now);
  if (status == ArenaProfessorLinkStatus.active) {
    final effective = effectiveProfessorPermissions(link);
    return (
      pills: [
        for (final info in professorPermissionCatalog)
          (
            key: info.key,
            label: info.shortLabel,
            on: effective.valueOf(info.key),
          ),
      ],
      text: null,
    );
  }
  return (
    pills: null,
    text: switch (status) {
      ArenaProfessorLinkStatus.invited => 'após o aceite',
      ArenaProfessorLinkStatus.pending => 'após a aprovação',
      _ => 'revogadas',
    },
  );
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/// Dias inteiros até vencer o convite, arredondando para cima (mínimo 1).
int arenaProfessorInviteDaysLeft(DateTime expiresAt, DateTime now) {
  final hours = expiresAt.difference(now).inMinutes / 60;
  final days = (hours / 24).ceil();
  return days < 1 ? 1 : days;
}

String _days(int n) => n == 1 ? '1 dia' : '$n dias';

/// Linha de data sob o status na lista ("desde mar 2025", "convite 18 out",
/// "pedido 19 out"…); `null` sem data gravada.
String? arenaProfessorStatusDateLine(ArenaProfessorLink link, DateTime now) {
  String? day(DateTime? date, String prefix) =>
      date == null ? null : '$prefix ${professorLinkShortDate(date, now)}';
  return switch (effectiveProfessorLinkStatus(link, now)) {
    ArenaProfessorLinkStatus.active => switch (
          link.approvedAt ?? link.respondedAt ?? link.updatedAt) {
        final since? => 'desde ${professorLinkMonthYear(since)}',
        null => null,
      },
    ArenaProfessorLinkStatus.invited => day(link.invitedAt, 'convite'),
    ArenaProfessorLinkStatus.expired => day(link.expiresAt, 'expirou'),
    ArenaProfessorLinkStatus.pending => day(link.requestedAt, 'pedido'),
    ArenaProfessorLinkStatus.suspended => day(link.suspendedAt, 'suspenso'),
    ArenaProfessorLinkStatus.ended => switch (link.endedAt) {
        final at? => 'encerrado ${professorLinkMonthYear(at)}',
        null => null,
      },
    ArenaProfessorLinkStatus.rejected => day(link.respondedAt, 'recusado'),
    ArenaProfessorLinkStatus.canceled => day(link.canceledAt, 'cancelado'),
  };
}

/// Subtítulo do detalhe (A4): "Vínculo desde 04 ago 2025", "Convite enviado
/// 20 out · expira em 7 dias"… (a tela põe em caixa alta).
String arenaProfessorDetailSubtitle(ArenaProfessorLink link, DateTime now) {
  String on(String prefix, DateTime? date) =>
      date == null ? prefix : '$prefix ${professorLinkShortDate(date, now)}';
  switch (effectiveProfessorLinkStatus(link, now)) {
    case ArenaProfessorLinkStatus.active:
      return on('Vínculo desde', link.approvedAt ?? link.respondedAt);
    case ArenaProfessorLinkStatus.suspended:
      return on('Suspenso desde', link.suspendedAt);
    case ArenaProfessorLinkStatus.invited:
      final sent = on('Convite enviado', link.invitedAt);
      final expiresAt = link.expiresAt;
      if (expiresAt == null) return sent;
      return '$sent · expira em '
          '${_days(arenaProfessorInviteDaysLeft(expiresAt, now))}';
    case ArenaProfessorLinkStatus.expired:
      return on('Convite expirou', link.expiresAt);
    case ArenaProfessorLinkStatus.pending:
      return on('Pedido em', link.requestedAt);
    case ArenaProfessorLinkStatus.ended:
      return on('Encerrado em', link.endedAt);
    case ArenaProfessorLinkStatus.rejected:
      return on('Recusado em', link.respondedAt);
    case ArenaProfessorLinkStatus.canceled:
      return on('Cancelado em', link.canceledAt);
  }
}

/// "enviada hoje às 21:14" / "enviada em 19 out às 21:14" (folha do pedido).
String? arenaProfessorRequestSentLabel(ArenaProfessorLink link, DateTime now) {
  final at = link.requestedAt;
  if (at == null) return null;
  final time = '${at.hour.toString().padLeft(2, '0')}:'
      '${at.minute.toString().padLeft(2, '0')}';
  final day = DateTime(at.year, at.month, at.day);
  final today = DateTime(now.year, now.month, now.day);
  return switch (today.difference(day).inDays) {
    0 => 'enviada hoje às $time',
    1 => 'enviada ontem às $time',
    _ => 'enviada em ${professorLinkShortDate(at, now)} às $time',
  };
}

// ---------------------------------------------------------------------------
// Lista: indicadores, filtros, ordem
// ---------------------------------------------------------------------------

class ArenaProfessorKpis {
  const ArenaProfessorKpis({
    this.staffActive = 0,
    this.staffSuspended = 0,
    this.independentActive = 0,
    this.independentSuspended = 0,
    this.pending = 0,
    this.invitesOpen = 0,
    this.nextInviteDaysLeft,
  });

  final int staffActive;
  final int staffSuspended;
  final int independentActive;
  final int independentSuspended;
  final int pending;
  final int invitesOpen;

  /// Prazo do convite em aberto que vence primeiro; `null` sem convite.
  final int? nextInviteDaysLeft;
}

ArenaProfessorKpis arenaProfessorKpis(
  List<ArenaProfessorLink> links,
  DateTime now,
) {
  var staffActive = 0;
  var staffSuspended = 0;
  var independentActive = 0;
  var independentSuspended = 0;
  var pending = 0;
  var invites = 0;
  DateTime? soonest;
  for (final link in links) {
    final staff = link.type == ArenaProfessorLinkType.arenaStaff;
    switch (effectiveProfessorLinkStatus(link, now)) {
      case ArenaProfessorLinkStatus.active:
        staff ? staffActive++ : independentActive++;
      case ArenaProfessorLinkStatus.suspended:
        staff ? staffSuspended++ : independentSuspended++;
      case ArenaProfessorLinkStatus.pending:
        pending++;
      case ArenaProfessorLinkStatus.invited:
        invites++;
        final expiresAt = link.expiresAt;
        if (expiresAt != null &&
            (soonest == null || expiresAt.isBefore(soonest))) {
          soonest = expiresAt;
        }
      default:
        break;
    }
  }
  return ArenaProfessorKpis(
    staffActive: staffActive,
    staffSuspended: staffSuspended,
    independentActive: independentActive,
    independentSuspended: independentSuspended,
    pending: pending,
    invitesOpen: invites,
    nextInviteDaysLeft:
        soonest == null ? null : arenaProfessorInviteDaysLeft(soonest, now),
  );
}

/// "ativos" / "ativo · 1 suspenso" (protótipo A1).
String arenaProfessorActiveKpiSub(int active, int suspended) {
  final base = active == 1 ? 'ativo' : 'ativos';
  if (suspended == 0) return base;
  return '$base · $suspended ${suspended == 1 ? 'suspenso' : 'suspensos'}';
}

String arenaProfessorInviteKpiSub(ArenaProfessorKpis kpis) {
  final days = kpis.nextInviteDaysLeft;
  if (kpis.invitesOpen == 0 || days == null) return 'nenhum em aberto';
  return kpis.invitesOpen == 1
      ? 'expira em ${_days(days)}'
      : 'o próximo expira em ${_days(days)}';
}

enum ArenaProfessorTypeFilter { all, arenaStaff, independent }

/// Grupo do filtro de status. Pedido não entra na lista — tem cards próprios.
enum ArenaProfessorStatusGroup { pending, active, invites, suspended, closed }

const arenaProfessorStatusFilters = [
  (group: ArenaProfessorStatusGroup.active, label: 'Ativos'),
  (group: ArenaProfessorStatusGroup.invites, label: 'Convites'),
  (group: ArenaProfessorStatusGroup.suspended, label: 'Suspensos'),
  (group: ArenaProfessorStatusGroup.closed, label: 'Encerrados'),
];

ArenaProfessorStatusGroup arenaProfessorStatusGroupOf(
  ArenaProfessorLinkStatus status,
) =>
    switch (status) {
      ArenaProfessorLinkStatus.pending => ArenaProfessorStatusGroup.pending,
      ArenaProfessorLinkStatus.active => ArenaProfessorStatusGroup.active,
      ArenaProfessorLinkStatus.invited => ArenaProfessorStatusGroup.invites,
      ArenaProfessorLinkStatus.suspended => ArenaProfessorStatusGroup.suspended,
      ArenaProfessorLinkStatus.rejected ||
      ArenaProfessorLinkStatus.ended ||
      ArenaProfessorLinkStatus.canceled ||
      ArenaProfessorLinkStatus.expired =>
        ArenaProfessorStatusGroup.closed,
    };

/// Pedidos primeiro, depois ativos, convites, suspensos e fechados; empate
/// pelo nome.
List<ArenaProfessorLink> sortArenaProfessorLinks(
  List<ArenaProfessorLink> links,
  DateTime now,
) {
  int rank(ArenaProfessorLink link) =>
      arenaProfessorStatusGroupOf(effectiveProfessorLinkStatus(link, now))
          .index;
  return [...links]..sort((a, b) {
      final byStatus = rank(a).compareTo(rank(b));
      if (byStatus != 0) return byStatus;
      return a.professorName
          .toLowerCase()
          .compareTo(b.professorName.toLowerCase());
    });
}

/// Linhas da lista (A1): sem os pedidos, filtradas por tipo, grupo de status
/// (`null` = todos) e nome (sem acento, sem caixa).
List<ArenaProfessorLink> filterArenaProfessorRows(
  List<ArenaProfessorLink> links, {
  required DateTime now,
  ArenaProfessorTypeFilter type = ArenaProfessorTypeFilter.all,
  ArenaProfessorStatusGroup? status,
  String term = '',
}) {
  final needle = normalizeSearchTerm(term);
  return [
    for (final link in sortArenaProfessorLinks(links, now))
      if (_matchesRow(link, now, type, status, needle)) link,
  ];
}

bool _matchesRow(
  ArenaProfessorLink link,
  DateTime now,
  ArenaProfessorTypeFilter type,
  ArenaProfessorStatusGroup? status,
  String needle,
) {
  final group =
      arenaProfessorStatusGroupOf(effectiveProfessorLinkStatus(link, now));
  if (group == ArenaProfessorStatusGroup.pending) return false;
  if (type == ArenaProfessorTypeFilter.arenaStaff &&
      link.type != ArenaProfessorLinkType.arenaStaff) {
    return false;
  }
  if (type == ArenaProfessorTypeFilter.independent &&
      link.type != ArenaProfessorLinkType.independent) {
    return false;
  }
  if (status != null && group != status) return false;
  return needle.isEmpty ||
      normalizeSearchTerm(link.professorName).contains(needle);
}

/// Linhas da lista sem filtro nenhum (contador do chip "Todos").
int arenaProfessorRowCount(List<ArenaProfessorLink> links, DateTime now) =>
    filterArenaProfessorRows(links, now: now).length;

/// Pedidos aguardando decisão, mais antigos primeiro.
List<ArenaProfessorLink> pendingArenaProfessorRequests(
  List<ArenaProfessorLink> links,
) {
  final pending = [
    for (final link in links)
      if (link.status == ArenaProfessorLinkStatus.pending) link,
  ];
  int millis(DateTime? d) => d?.millisecondsSinceEpoch ?? 0;
  pending
      .sort((a, b) => millis(a.requestedAt).compareTo(millis(b.requestedAt)));
  return pending;
}

/// Subtítulo da entrada "Profissionais" nos Ajustes.
String arenaProfessionalsEntrySubtitle(
  List<ArenaProfessorLink> links,
  DateTime now,
) {
  final kpis = arenaProfessorKpis(links, now);
  if (kpis.pending > 0) {
    return kpis.pending == 1
        ? '1 solicitação para analisar'
        : '${kpis.pending} solicitações para analisar';
  }
  final active = kpis.staffActive + kpis.independentActive;
  if (active > 0) {
    return active == 1 ? '1 professor ativo' : '$active professores ativos';
  }
  if (kpis.invitesOpen > 0) {
    return kpis.invitesOpen == 1
        ? '1 convite aguardando resposta'
        : '${kpis.invitesOpen} convites aguardando resposta';
  }
  return 'Convidar e aprovar professores';
}

// ---------------------------------------------------------------------------
// Convite: situação de cada conta encontrada na busca
// ---------------------------------------------------------------------------

/// Conta NexaGO encontrada na busca do convite.
class ArenaProfessorCandidate {
  const ArenaProfessorCandidate({
    required this.uid,
    required this.name,
    this.subtitle = '',
    this.photoUrl,
  });

  final String uid;
  final String name;

  /// "Nome completo · Cidade/UF" (vazio quando não há o que mostrar).
  final String subtitle;
  final String? photoUrl;
}

/// Mesmo formato dos resultados da busca das Aulas (apelido, senão nome).
ArenaProfessorCandidate arenaProfessorCandidateFrom(AppUserProfile user) {
  final nick = user.nickname?.trim() ?? '';
  final full = user.fullName?.trim() ?? '';
  final name = nick.isNotEmpty ? nick : (full.isNotEmpty ? full : 'Atleta');
  final city = [user.city, user.state]
      .whereType<String>()
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .join('/');
  final photo = user.profilePhotoUrl?.trim() ?? '';
  return ArenaProfessorCandidate(
    uid: user.uid,
    name: name,
    subtitle: [
      if (full.isNotEmpty && full != name) full,
      if (city.isNotEmpty) city,
    ].join(' · '),
    photoUrl: photo.isEmpty ? null : photo,
  );
}

enum ArenaProfessorAccountState { available, invited, requested, linked }

/// Cruza a busca com a lista carregada: vínculo em aberto bloqueia um convite
/// novo; vínculo fechado (ou convite vencido) permite convidar de novo — o
/// servidor reabre o mesmo doc.
ArenaProfessorAccountState arenaProfessorAccountState(
  List<ArenaProfessorLink> links,
  String uid,
  DateTime now,
) {
  for (final link in links) {
    if (link.professorUserId != uid) continue;
    return switch (effectiveProfessorLinkStatus(link, now)) {
      ArenaProfessorLinkStatus.invited => ArenaProfessorAccountState.invited,
      ArenaProfessorLinkStatus.pending => ArenaProfessorAccountState.requested,
      ArenaProfessorLinkStatus.active ||
      ArenaProfessorLinkStatus.suspended =>
        ArenaProfessorAccountState.linked,
      _ => ArenaProfessorAccountState.available,
    };
  }
  return ArenaProfessorAccountState.available;
}

String? arenaProfessorAccountStateLabel(ArenaProfessorAccountState state) =>
    switch (state) {
      ArenaProfessorAccountState.available => null,
      ArenaProfessorAccountState.invited =>
        'Já convidado · aguardando resposta',
      ArenaProfessorAccountState.requested => 'Pediu vínculo · analise',
      ArenaProfessorAccountState.linked => 'Já vinculado',
    };

/// Página da arena no portal do atleta (`/reservar/{arenaId}`): é lá (e na
/// página da arena no app) que fica o "Você é professor?" para quem não foi
/// convidado pedir o vínculo.
String arenaProfessorRequestPageUrl(String arenaId) =>
    '${AppDomains.athletePortal}/reservar/${Uri.encodeComponent(arenaId)}';

// ---------------------------------------------------------------------------
// Detalhe: ações por estado
// ---------------------------------------------------------------------------

enum ArenaProfessorAction {
  analyze,
  suspend,
  reactivate,
  end,
  cancelInvite,
  resendInvite,
}

/// Ações do gestor no estado atual (mesma tabela do portal).
List<ArenaProfessorAction> arenaProfessorActions(
  ArenaProfessorLink link,
  DateTime now,
) =>
    switch (link.status) {
      ArenaProfessorLinkStatus.active => const [
          ArenaProfessorAction.suspend,
          ArenaProfessorAction.end,
        ],
      ArenaProfessorLinkStatus.suspended => const [
          ArenaProfessorAction.reactivate,
          ArenaProfessorAction.end,
        ],
      ArenaProfessorLinkStatus.pending => const [ArenaProfessorAction.analyze],
      ArenaProfessorLinkStatus.invited => isProfessorInviteExpired(link, now)
          ? const [
              ArenaProfessorAction.resendInvite,
              ArenaProfessorAction.cancelInvite,
            ]
          : const [ArenaProfessorAction.cancelInvite],
      ArenaProfessorLinkStatus.expired =>
        link.initiatedBy == ArenaProfessorSide.arena
            ? const [ArenaProfessorAction.resendInvite]
            : const [],
      ArenaProfessorLinkStatus.rejected ||
      ArenaProfessorLinkStatus.ended ||
      ArenaProfessorLinkStatus.canceled =>
        const [],
    };

/// Motivo do estado fechado/suspenso para a ficha do detalhe.
({String label, String text})? arenaProfessorReasonFact(
  ArenaProfessorLink link,
) {
  switch (link.status) {
    case ArenaProfessorLinkStatus.suspended:
      final reason = link.suspensionReason;
      if (reason == null) return null;
      final details = link.suspensionDetails;
      return (
        label: 'Motivo da suspensão',
        text: details == null ? reason : '$reason — $details',
      );
    case ArenaProfessorLinkStatus.ended:
      final reason = link.endedReason;
      if (reason == null) return null;
      return (
        label: link.endedBySide == ArenaProfessorSide.professor
            ? 'Encerrado pelo professor'
            : 'Motivo do encerramento',
        text: reason,
      );
    case ArenaProfessorLinkStatus.rejected:
      final reason = link.rejectionReason;
      return reason == null ? null : (label: 'Motivo da recusa', text: reason);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

String arenaProfessorFirstName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? name : parts.first;
}

/// "Beach Tennis · Vôlei de praia" ou o aviso de que o perfil não informa.
String arenaProfessorModalitiesLabel(ArenaProfessorLink link) =>
    link.professorModalities.isEmpty
        ? 'Modalidades não informadas'
        : link.professorModalities.join(' · ');

String _eventTypeLabel(ArenaProfessorLinkEvent event, ArenaProfessorLink link) {
  final raw = event.metadata['relationshipType'];
  return professorLinkTypeLabel(
    raw is String ? ArenaProfessorLinkType.parse(raw) : link.type,
  );
}

/// Linha principal do evento, do ponto de vista da arena (tabela da spec).
String arenaProfessorEventTitle(
  ArenaProfessorLinkEvent event,
  ArenaProfessorLink link,
) {
  final byProfessor = event.actorRole == 'PROFESSOR';
  final reason = event.reason;
  String withReason(String text) =>
      reason == null || reason.isEmpty ? text : '$text · $reason';
  return switch (event.eventType) {
    'INVITED' => 'Convite enviado · ${_eventTypeLabel(event, link)}',
    'REQUESTED' =>
      '${arenaProfessorFirstName(event.actorName.isEmpty ? link.professorName : event.actorName)} '
          'solicitou vínculo · ${_eventTypeLabel(event, link)}',
    'ACCEPTED' => 'Convite aceito',
    'REJECTED' => byProfessor
        ? withReason('Convite recusado pelo professor')
        : withReason('Solicitação recusada'),
    'APPROVED' => 'Solicitação aprovada como ${_eventTypeLabel(event, link)}',
    'SUSPENDED' => withReason('Vínculo suspenso'),
    'REACTIVATED' => 'Vínculo reativado',
    'ENDED' => byProfessor
        ? withReason('Vínculo encerrado pelo professor')
        : withReason('Vínculo encerrado'),
    'PERMISSIONS_CHANGED' => _permissionsChangedTitle(event.metadata),
    'COURT_DISCOUNT_CHANGED' =>
      professorCourtDiscountChangedTitle(event.metadata),
    'CANCELED' => byProfessor || event.metadata['side'] == 'PROFESSOR'
        ? 'Pedido cancelado'
        : 'Convite cancelado',
    'EXPIRED' => 'Convite expirou',
    _ => event.eventType,
  };
}

String _permissionsChangedTitle(Map<String, Object?> metadata) {
  final changedRaw = metadata['changed'];
  final after = ArenaProfessorPermissions.fromMap(metadata['after']);
  final changed = <ArenaProfessorPermissionKey>[
    if (changedRaw is List)
      for (final raw in changedRaw)
        if (ArenaProfessorPermissionKey.tryParse(raw) case final key?) key,
  ];
  if (changed.isEmpty) return 'Permissões alteradas';
  String part(ArenaProfessorPermissionKey key) =>
      '“${professorPermissionInfo(key).title}” '
      '${after.valueOf(key) ? 'ligada' : 'removida'}';
  if (changed.length == 1) return 'Permissão ${part(changed.single)}';
  return 'Permissões alteradas · ${changed.map(part).join(' · ')}';
}

/// Linha de baixo: "APPROVED · Ana Souza · 06 mai".
String arenaProfessorEventMeta(ArenaProfessorLinkEvent event, DateTime now) {
  final actor = switch (event.actorRole) {
    'SYSTEM' => 'Sistema',
    'ADMIN' =>
      '${event.actorName.isEmpty ? 'NexaGO' : event.actorName} · suporte',
    _ => event.actorName.isEmpty ? '—' : event.actorName,
  };
  final date = event.createdAt;
  return [
    event.eventType,
    actor,
    if (date != null) professorLinkShortDate(date, now),
  ].join(' · ');
}
