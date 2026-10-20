import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_logic.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_providers.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_repository.dart';
import 'package:nexago_app/features/arena/presentation/professionals/arena_professional_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/professionals/arena_professionals_page.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_link_rules.dart';

export '../../../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts, settleProfessorLinks, settleProfessorSheet;

/// Apoio dos testes da tela Profissionais (lado da arena): vínculos do
/// protótipo, o dublê do repositório (que imita o servidor nas transições) e
/// o app mínimo com as rotas reais.

/// "Agora" fixo: 20/10/2026, 12:00 (horário local).
final arenaTestNow = DateTime(2026, 10, 20, 12);

const arenaTestId = 'arena-cfc';
const arenaTestName = 'Arena CFC';

const _allPermissions = ArenaProfessorPermissions(
  canManageOwnLessons: true,
  canBookCourts: true,
  canAppearInArenaProfile: true,
);

ArenaProfessorLink arenaLink({
  required String uid,
  required String name,
  ArenaProfessorLinkType type = ArenaProfessorLinkType.arenaStaff,
  ArenaProfessorLinkStatus status = ArenaProfessorLinkStatus.active,
  ArenaProfessorSide initiatedBy = ArenaProfessorSide.arena,
  ArenaProfessorPermissions permissions = _allPermissions,
  List<String> modalities = const ['Beach Tennis'],
  String? message,
  DateTime? invitedAt,
  DateTime? requestedAt,
  DateTime? expiresAt,
  DateTime? respondedAt,
  DateTime? approvedAt,
  DateTime? suspendedAt,
  DateTime? endedAt,
  DateTime? canceledAt,
  DateTime? updatedAt,
  String? invitedByName,
  String? approvedByName,
  String? rejectionReason,
  String? suspensionReason,
  String? suspensionDetails,
  String? endedReason,
  ArenaProfessorSide? endedBySide,
  int cycle = 1,
}) =>
    ArenaProfessorLink(
      id: arenaProfessorLinkIdFor(arenaTestId, uid),
      arenaId: arenaTestId,
      professorUserId: uid,
      type: type,
      status: status,
      permissions: permissions,
      initiatedBy: initiatedBy,
      cycle: cycle,
      message: message,
      professorName: name,
      professorModalities: modalities,
      arenaName: arenaTestName,
      invitedAt: invitedAt,
      requestedAt: requestedAt,
      expiresAt: expiresAt,
      respondedAt: respondedAt,
      approvedAt: approvedAt,
      suspendedAt: suspendedAt,
      endedAt: endedAt,
      canceledAt: canceledAt,
      updatedAt: updatedAt,
      invitedByName: invitedByName,
      approvedByName: approvedByName,
      rejectionReason: rejectionReason,
      suspensionReason: suspensionReason,
      suspensionDetails: suspensionDetails,
      endedReason: endedReason,
      endedBySide: endedBySide,
    );

/// Mesmo vínculo com outros campos — o que o servidor gravaria numa transição.
ArenaProfessorLink copyArenaLink(
  ArenaProfessorLink link, {
  ArenaProfessorLinkType? type,
  ArenaProfessorLinkStatus? status,
  ArenaProfessorPermissions? permissions,
  ArenaProfessorSide? initiatedBy,
  int? cycle,
  String? message,
  DateTime? invitedAt,
  DateTime? expiresAt,
  DateTime? approvedAt,
  DateTime? suspendedAt,
  DateTime? endedAt,
  DateTime? respondedAt,
  DateTime? canceledAt,
  String? suspensionReason,
  String? suspensionDetails,
  String? endedReason,
  String? rejectionReason,
  ArenaProfessorSide? endedBySide,
}) =>
    ArenaProfessorLink(
      id: link.id,
      arenaId: link.arenaId,
      professorUserId: link.professorUserId,
      type: type ?? link.type,
      status: status ?? link.status,
      permissions: permissions ?? link.permissions,
      initiatedBy: initiatedBy ?? link.initiatedBy,
      cycle: cycle ?? link.cycle,
      message: message ?? link.message,
      professorName: link.professorName,
      professorPhotoUrl: link.professorPhotoUrl,
      professorModalities: link.professorModalities,
      arenaName: link.arenaName,
      invitedAt: invitedAt ?? link.invitedAt,
      requestedAt: link.requestedAt,
      expiresAt: expiresAt ?? link.expiresAt,
      respondedAt: respondedAt ?? link.respondedAt,
      approvedAt: approvedAt ?? link.approvedAt,
      suspendedAt: suspendedAt ?? link.suspendedAt,
      endedAt: endedAt ?? link.endedAt,
      canceledAt: canceledAt ?? link.canceledAt,
      updatedAt: arenaTestNow,
      invitedByName: link.invitedByName,
      approvedByName: link.approvedByName,
      rejectionReason: rejectionReason ?? link.rejectionReason,
      suspensionReason: suspensionReason ?? link.suspensionReason,
      suspensionDetails: suspensionDetails ?? link.suspensionDetails,
      endedReason: endedReason ?? link.endedReason,
      endedBySide: endedBySide ?? link.endedBySide,
    );

// ── vínculos do protótipo A1 ────────────────────────────────────────────────

ArenaProfessorLink marcosActive() => arenaLink(
      uid: 'marcos',
      name: 'Marcos Lima',
      type: ArenaProfessorLinkType.independent,
      initiatedBy: ArenaProfessorSide.professor,
      modalities: const ['Vôlei de praia'],
      permissions: const ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: false,
      ),
      requestedAt: DateTime(2025, 8, 2),
      approvedAt: DateTime(2025, 8, 4),
      approvedByName: 'Ana Souza',
      message: 'Tenho alunos particulares de manhã cedo.',
    );

ArenaProfessorLink rafaelPending() => arenaLink(
      uid: 'rafael',
      name: 'Rafael Cunha',
      type: ArenaProfessorLinkType.independent,
      status: ArenaProfessorLinkStatus.pending,
      initiatedBy: ArenaProfessorSide.professor,
      permissions: const ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: false,
      ),
      requestedAt: DateTime(2026, 10, 19, 21, 14),
      message: 'Tenho 8 alunos particulares na região e queria reservar '
          'quadra de manhã cedo, 3x por semana.',
    );

ArenaProfessorLink julianaPending() => arenaLink(
      uid: 'juliana',
      name: 'Juliana Prado',
      status: ArenaProfessorLinkStatus.pending,
      initiatedBy: ArenaProfessorSide.professor,
      requestedAt: DateTime(2026, 10, 20, 8, 30),
    );

ArenaProfessorLink lucasInvited({DateTime? expiresAt}) => arenaLink(
      uid: 'lucas',
      name: 'Lucas Ferraz',
      status: ArenaProfessorLinkStatus.invited,
      invitedAt: DateTime(2026, 10, 19, 12),
      expiresAt: expiresAt ?? DateTime(2026, 10, 26, 12),
      invitedByName: 'Ana Souza',
      message: 'Queremos você nas turmas de sábado.',
    );

ArenaProfessorLink brunaSuspended() => arenaLink(
      uid: 'bruna',
      name: 'Bruna Alves',
      type: ArenaProfessorLinkType.independent,
      status: ArenaProfessorLinkStatus.suspended,
      approvedAt: DateTime(2026, 3, 1),
      suspendedAt: DateTime(2026, 10, 12),
      suspensionReason: 'Pendência de pagamento',
      suspensionDetails: '3 reservas de setembro em aberto.',
    );

ArenaProfessorLink pauloEnded() => arenaLink(
      uid: 'paulo',
      name: 'Paulo Reis',
      status: ArenaProfessorLinkStatus.ended,
      approvedAt: DateTime(2025, 1, 10),
      endedAt: DateTime(2026, 2, 3),
      endedBySide: ArenaProfessorSide.professor,
      endedReason: 'Mudei de cidade',
    );

/// Três da equipe ativos, Marcos (independente) ativo, Bruna suspensa, dois
/// pedidos, um convite e um encerrado — o A1 do protótipo.
List<ArenaProfessorLink> prototypeArenaLinks() => [
      arenaLink(
        uid: 'carla',
        name: 'Carla Nunes',
        approvedAt: DateTime(2025, 3, 10),
      ),
      arenaLink(
        uid: 'diego',
        name: 'Diego Torres',
        approvedAt: DateTime(2025, 6, 1),
      ),
      arenaLink(
        uid: 'eva',
        name: 'Eva Martins',
        approvedAt: DateTime(2026, 1, 5),
      ),
      marcosActive(),
      brunaSuspended(),
      rafaelPending(),
      julianaPending(),
      lucasInvited(),
      pauloEnded(),
    ];

// ── dublê do repositório ────────────────────────────────────────────────────

typedef InviteCall = ({
  String arenaId,
  String professorUserId,
  ArenaProfessorLinkType type,
  ArenaProfessorPermissions permissions,
  String? message,
});
typedef ApproveCall = ({String linkId, ArenaProfessorPermissions permissions});
typedef ReasonCall = ({String linkId, String? reason});
typedef SuspendCall = ({String linkId, String reason, String? details});
typedef PermissionCall = ({
  String linkId,
  ArenaProfessorPermissionKey key,
  bool value,
});

/// Repositório em memória. Sem erro configurado, cada ação muda o vínculo
/// como o servidor faria e as leituras ao vivo emitem de novo.
class FakeArenaProfessionalsRepository implements ArenaProfessionalsRepository {
  FakeArenaProfessionalsRepository({
    List<ArenaProfessorLink>? links,
    Map<String, List<ArenaProfessorLinkEvent>>? events,
    List<ArenaProfessorCandidate>? accounts,
    this.error,
  })  : links = links ?? [],
        events = events ?? {},
        accounts = accounts ?? [];

  List<ArenaProfessorLink> links;
  Map<String, List<ArenaProfessorLinkEvent>> events;
  List<ArenaProfessorCandidate> accounts;

  /// Lançado por TODA ação (callable); leituras seguem funcionando.
  Object? error;

  /// `updatePermission` grava mas o snapshot só chega quando o teste chamar
  /// [flushPermissionEcho] (imita o atraso do listener).
  bool holdPermissionEcho = false;
  final List<void Function()> _heldEchoes = [];

  final inviteCalls = <InviteCall>[];
  final approveCalls = <ApproveCall>[];
  final rejectCalls = <ReasonCall>[];
  final suspendCalls = <SuspendCall>[];
  final reactivateCalls = <String>[];
  final endCalls = <ReasonCall>[];
  final cancelCalls = <String>[];
  final permissionCalls = <PermissionCall>[];
  final searchCalls = <String>[];

  final _changes = StreamController<void>.broadcast();

  void setLinks(List<ArenaProfessorLink> next) {
    links = next;
    _changes.add(null);
  }

  ArenaProfessorLink? find(String linkId) {
    for (final link in links) {
      if (link.id == linkId) return link;
    }
    return null;
  }

  void _replace(ArenaProfessorLink next) {
    setLinks([
      for (final link in links)
        if (link.id == next.id) next else link,
      if (find(next.id) == null) next,
    ]);
  }

  void flushPermissionEcho() {
    for (final echo in _heldEchoes) {
      echo();
    }
    _heldEchoes.clear();
  }

  Stream<T> _live<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  ProfessorLinkResult _result(String linkId, ArenaProfessorLinkStatus status) =>
      ProfessorLinkResult(linkId: linkId, status: status);

  void _throwIfError() {
    final e = error;
    if (e != null) throw e;
  }

  @override
  Stream<List<ArenaProfessorLink>> watchArenaLinks(String arenaId) => _live(
        () => [
          for (final link in links)
            if (link.arenaId == arenaId) link,
        ],
      );

  @override
  Stream<ArenaProfessorLink?> watchLink(String linkId) =>
      _live(() => find(linkId));

  @override
  Stream<List<ArenaProfessorLinkEvent>> watchEvents(String linkId) =>
      Stream.value(events[linkId] ?? const []);

  @override
  Future<List<ArenaProfessorCandidate>> searchAccounts(String term) async {
    searchCalls.add(term);
    final needle = term.trim().toLowerCase();
    return [
      for (final account in accounts)
        if (account.name.toLowerCase().contains(needle)) account,
    ];
  }

  @override
  Future<ProfessorLinkResult> invite({
    required String arenaId,
    required String professorUserId,
    required ArenaProfessorLinkType type,
    required ArenaProfessorPermissions permissions,
    String? message,
  }) async {
    inviteCalls.add((
      arenaId: arenaId,
      professorUserId: professorUserId,
      type: type,
      permissions: permissions,
      message: message,
    ));
    _throwIfError();
    final linkId = arenaProfessorLinkIdFor(arenaId, professorUserId);
    final current = find(linkId);
    final name = current?.professorName ??
        accounts
            .firstWhere(
              (a) => a.uid == professorUserId,
              orElse: () => ArenaProfessorCandidate(
                uid: professorUserId,
                name: 'Professor',
              ),
            )
            .name;
    _replace(arenaLink(
      uid: professorUserId,
      name: name,
      type: type,
      status: ArenaProfessorLinkStatus.invited,
      permissions: permissions,
      message: message,
      invitedAt: arenaTestNow,
      expiresAt: arenaTestNow.add(const Duration(days: 7)),
      updatedAt: arenaTestNow,
      cycle: (current?.cycle ?? 0) + 1,
    ));
    return _result(linkId, ArenaProfessorLinkStatus.invited);
  }

  @override
  Future<ProfessorLinkResult> approve({
    required String linkId,
    required ArenaProfessorPermissions permissions,
  }) async {
    approveCalls.add((linkId: linkId, permissions: permissions));
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      _replace(copyArenaLink(
        current,
        status: ArenaProfessorLinkStatus.active,
        permissions: permissions,
        approvedAt: arenaTestNow,
      ));
    }
    return _result(linkId, ArenaProfessorLinkStatus.active);
  }

  @override
  Future<ProfessorLinkResult> reject({
    required String linkId,
    String? reason,
  }) async {
    rejectCalls.add((linkId: linkId, reason: reason));
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      _replace(copyArenaLink(
        current,
        status: ArenaProfessorLinkStatus.rejected,
        respondedAt: arenaTestNow,
        rejectionReason: reason,
      ));
    }
    return _result(linkId, ArenaProfessorLinkStatus.rejected);
  }

  @override
  Future<ProfessorLinkResult> suspend({
    required String linkId,
    required String reason,
    String? details,
  }) async {
    suspendCalls.add((linkId: linkId, reason: reason, details: details));
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      _replace(copyArenaLink(
        current,
        status: ArenaProfessorLinkStatus.suspended,
        suspendedAt: arenaTestNow,
        suspensionReason: reason,
        suspensionDetails: details,
      ));
    }
    return _result(linkId, ArenaProfessorLinkStatus.suspended);
  }

  @override
  Future<ProfessorLinkResult> reactivate(String linkId) async {
    reactivateCalls.add(linkId);
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      _replace(copyArenaLink(current, status: ArenaProfessorLinkStatus.active));
    }
    return _result(linkId, ArenaProfessorLinkStatus.active);
  }

  @override
  Future<ProfessorLinkResult> end({
    required String linkId,
    String? reason,
  }) async {
    endCalls.add((linkId: linkId, reason: reason));
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      _replace(copyArenaLink(
        current,
        status: ArenaProfessorLinkStatus.ended,
        endedAt: arenaTestNow,
        endedReason: reason,
        endedBySide: ArenaProfessorSide.arena,
      ));
    }
    return _result(linkId, ArenaProfessorLinkStatus.ended);
  }

  @override
  Future<ProfessorLinkResult> cancelInvite(String linkId) async {
    cancelCalls.add(linkId);
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      _replace(copyArenaLink(
        current,
        status: ArenaProfessorLinkStatus.canceled,
        canceledAt: arenaTestNow,
      ));
    }
    return _result(linkId, ArenaProfessorLinkStatus.canceled);
  }

  @override
  Future<ProfessorLinkResult> updatePermission({
    required String linkId,
    required ArenaProfessorPermissionKey key,
    required bool value,
  }) async {
    permissionCalls.add((linkId: linkId, key: key, value: value));
    _throwIfError();
    final current = find(linkId);
    if (current != null) {
      void echo() => _replace(copyArenaLink(
            current,
            permissions: arenaProfessorPermissionsWith(
              current.permissions,
              key,
              value,
            ),
          ));
      holdPermissionEcho ? _heldEchoes.add(echo) : echo();
    }
    return _result(linkId, current?.status ?? ArenaProfessorLinkStatus.active);
  }
}

// ── app mínimo com as rotas reais ──────────────────────────────────────────

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

/// Monta Profissionais (lista + detalhe) com GoRouter sobre o [repo]. Por
/// padrão o usuário administra a arena de teste; [canManage] falso = só
/// leitura. Largura de iPhone (390) para pegar estouro.
Future<GoRouter> pumpArenaProfessionalsApp(
  WidgetTester tester, {
  required FakeArenaProfessionalsRepository repo,
  String location = AppRoutes.arenaProfessionals,
  bool canManage = true,
  AsyncValue<ArenaProfessionalsScope?>? scope,
  Size size = const Size(390, 1800),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.arenaSettings,
        name: AppRouteNames.arenaSettings,
        builder: (_, __) => _stub('ajustes'),
      ),
      GoRoute(
        path: AppRoutes.arenaProfessionals,
        name: AppRouteNames.arenaProfessionals,
        builder: (_, __) => const ArenaProfessionalsPage(),
        routes: [
          GoRoute(
            path: ':linkId',
            name: AppRouteNames.arenaProfessionalDetail,
            builder: (_, state) => ArenaProfessionalDetailPage(
              linkId: state.pathParameters['linkId'] ?? '',
            ),
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        arenaProfessionalsRepositoryProvider.overrideWithValue(repo),
        arenaProfessionalsScopeProvider.overrideWithValue(
          scope ??
              AsyncValue.data(
                ArenaProfessionalsScope(
                  arenaId: arenaTestId,
                  arenaName: arenaTestName,
                  canManage: canManage,
                ),
              ),
        ),
        arenaProfessionalsManagedArenaIdsProvider.overrideWithValue(
          canManage ? const {arenaTestId} : const <String>{},
        ),
        arenaProfessionalsClockProvider.overrideWithValue(() => arenaTestNow),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
  return router;
}
