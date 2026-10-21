import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_link_rules.dart';
import 'package:nexago_app/features/professor_links/domain/professor_links_repository.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_detail_page.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_request_sent_page.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_my_arenas_page.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/arena_professor_link_card.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/arena_public_professors_section.dart';

/// Apoio dos testes dos vínculos professor ↔ arena: vínculos realistas, o
/// dublê do repositório (que imita o servidor nas transições) e o app mínimo
/// com as rotas reais da feature.

/// "Agora" fixo de todos os testes: 20/10/2026, 12:00 (horário local).
final professorTestNow = DateTime(2026, 10, 20, 12);

const professorTestUid = 'prof-1';

ArenaProfessorLink professorLink({
  String arenaId = 'arena-sul',
  String arenaName = 'Arena Sul',
  String? arenaCity = 'Goiânia · GO',
  ArenaProfessorLinkType type = ArenaProfessorLinkType.arenaStaff,
  ArenaProfessorLinkStatus status = ArenaProfessorLinkStatus.active,
  ArenaProfessorSide initiatedBy = ArenaProfessorSide.arena,
  ArenaProfessorPermissions permissions = const ArenaProfessorPermissions(
    canManageOwnLessons: true,
    canBookCourts: true,
    canAppearInArenaProfile: true,
  ),
  String? message,
  DateTime? invitedAt,
  DateTime? requestedAt,
  DateTime? expiresAt,
  DateTime? approvedAt,
  DateTime? suspendedAt,
  DateTime? endedAt,
  DateTime? updatedAt,
  String? invitedByName,
  String? suspensionReason,
  ArenaProfessorSide? endedBySide,
  String? endedReason,
  int courtDiscountPercent = 0,
  String? courtDiscountStartTime,
  String? courtDiscountEndTime,
}) =>
    ArenaProfessorLink(
      id: arenaProfessorLinkIdFor(arenaId, professorTestUid),
      arenaId: arenaId,
      professorUserId: professorTestUid,
      type: type,
      status: status,
      initiatedBy: initiatedBy,
      permissions: permissions,
      message: message,
      professorName: 'Thiago Mendes',
      arenaName: arenaName,
      arenaCity: arenaCity,
      invitedAt: invitedAt,
      requestedAt: requestedAt,
      expiresAt: expiresAt,
      approvedAt: approvedAt,
      suspendedAt: suspendedAt,
      endedAt: endedAt,
      updatedAt: updatedAt,
      invitedByName: invitedByName,
      suspensionReason: suspensionReason,
      endedBySide: endedBySide,
      endedReason: endedReason,
      courtDiscountPercent: courtDiscountPercent,
      courtDiscountStartTime: courtDiscountStartTime,
      courtDiscountEndTime: courtDiscountEndTime,
    );

/// Convite de equipe da Arena Sul, mandado hoje às 10:42, vence em 7 dias.
ArenaProfessorLink invitedLink({
  String arenaId = 'arena-sul',
  String arenaName = 'Arena Sul',
  DateTime? expiresAt,
  String? message,
}) =>
    professorLink(
      arenaId: arenaId,
      arenaName: arenaName,
      status: ArenaProfessorLinkStatus.invited,
      invitedAt: DateTime(2026, 10, 20, 10, 42),
      expiresAt: expiresAt ?? DateTime(2026, 10, 27, 10, 42),
      updatedAt: DateTime(2026, 10, 20, 10, 42),
      invitedByName: 'Ricardo Prado',
      message: message,
    );

/// Lista do protótipo M1: convite (Arena Sul), dois ativos, um pedido e um
/// encerrado.
List<ArenaProfessorLink> prototypeLinks() => [
      invitedLink(),
      professorLink(
        arenaId: 'arena-cfc',
        arenaName: 'Arena CFC',
        approvedAt: DateTime(2025, 3, 10),
        updatedAt: DateTime(2025, 3, 10),
      ),
      professorLink(
        arenaId: 'arena-norte',
        arenaName: 'Arena Norte',
        type: ArenaProfessorLinkType.independent,
        initiatedBy: ArenaProfessorSide.professor,
        permissions: const ArenaProfessorPermissions(
          canManageOwnLessons: true,
          canBookCourts: true,
          canAppearInArenaProfile: false,
        ),
        approvedAt: DateTime(2026, 5, 6),
        updatedAt: DateTime(2026, 9, 1),
      ),
      professorLink(
        arenaId: 'lagoa',
        arenaName: 'Lagoa Beach Club',
        type: ArenaProfessorLinkType.independent,
        status: ArenaProfessorLinkStatus.pending,
        initiatedBy: ArenaProfessorSide.professor,
        requestedAt: DateTime(2026, 10, 17),
        updatedAt: DateTime(2026, 10, 17),
      ),
      professorLink(
        arenaId: 'beach-point',
        arenaName: 'Beach Point',
        type: ArenaProfessorLinkType.independent,
        status: ArenaProfessorLinkStatus.ended,
        endedAt: DateTime(2026, 2, 3),
        updatedAt: DateTime(2026, 2, 3),
      ),
    ];

// ── dublê do repositório ────────────────────────────────────────────────────

typedef RequestCall = ({
  String arenaId,
  ArenaProfessorLinkType type,
  String? message,
});
typedef RespondCall = ({String linkId, bool accept, String? reason});
typedef EndCall = ({String linkId, String? reason});

/// Repositório em memória. Sem erro configurado, cada ação também muda o
/// vínculo como o servidor faria (pedido nasce `PENDING`, aceite vira
/// `ACTIVE`…) e as leituras ao vivo emitem de novo.
class FakeProfessorLinksRepository implements ProfessorLinksRepository {
  FakeProfessorLinksRepository({
    List<ArenaProfessorLink>? links,
    Map<String, List<ArenaProfessorLinkEvent>>? events,
    Map<String, List<PublicArenaProfessor>>? publicProfessors,
    this.requestError,
    this.respondError,
    this.cancelError,
    this.endError,
  })  : links = links ?? [],
        events = events ?? {},
        publicProfessors = publicProfessors ?? {};

  List<ArenaProfessorLink> links;
  Map<String, List<ArenaProfessorLinkEvent>> events;
  Map<String, List<PublicArenaProfessor>> publicProfessors;
  Object? requestError;
  Object? respondError;
  Object? cancelError;
  Object? endError;

  final requestCalls = <RequestCall>[];
  final respondCalls = <RespondCall>[];
  final cancelCalls = <String>[];
  final endCalls = <EndCall>[];
  final watchLinkCalls = <String>[];

  final _changes = StreamController<void>.broadcast();

  void setLinks(List<ArenaProfessorLink> next) {
    links = next;
    _changes.add(null);
  }

  void _replace(String linkId, ArenaProfessorLink next) {
    setLinks([
      for (final link in links)
        if (link.id == linkId) next else link,
    ]);
  }

  ArenaProfessorLink? _find(String linkId) {
    for (final link in links) {
      if (link.id == linkId) return link;
    }
    return null;
  }

  Stream<T> _live<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  @override
  Stream<List<ArenaProfessorLink>> watchMyLinks(String professorUserId) =>
      _live(
        () => [
          for (final link in links)
            if (link.professorUserId == professorUserId) link,
        ],
      );

  @override
  Stream<ArenaProfessorLink?> watchLink(String linkId) {
    watchLinkCalls.add(linkId);
    return _live(() => _find(linkId));
  }

  @override
  Stream<List<ArenaProfessorLinkEvent>> watchEvents(String linkId) =>
      Stream.value(events[linkId] ?? const []);

  @override
  Stream<List<PublicArenaProfessor>> watchPublicProfessors(String arenaId) =>
      Stream.value(publicProfessors[arenaId] ?? const []);

  @override
  Future<ProfessorLinkResult> requestLink({
    required String arenaId,
    required ArenaProfessorLinkType type,
    String? message,
  }) async {
    requestCalls.add((arenaId: arenaId, type: type, message: message));
    final error = requestError;
    if (error != null) throw error;
    final linkId = arenaProfessorLinkIdFor(arenaId, professorTestUid);
    final next = professorLink(
      arenaId: arenaId,
      arenaName: _find(linkId)?.arenaName ?? 'Praia Viva Arena',
      type: type,
      status: ArenaProfessorLinkStatus.pending,
      initiatedBy: ArenaProfessorSide.professor,
      requestedAt: professorTestNow,
      updatedAt: professorTestNow,
    );
    setLinks([
      for (final link in links)
        if (link.id != linkId) link,
      next,
    ]);
    return ProfessorLinkResult(
      linkId: linkId,
      status: ArenaProfessorLinkStatus.pending,
    );
  }

  @override
  Future<ProfessorLinkResult> respondToInvite({
    required String linkId,
    required bool accept,
    String? reason,
  }) async {
    respondCalls.add((linkId: linkId, accept: accept, reason: reason));
    final error = respondError;
    if (error != null) throw error;
    final status = accept
        ? ArenaProfessorLinkStatus.active
        : ArenaProfessorLinkStatus.rejected;
    final current = _find(linkId);
    if (current != null) _replace(linkId, _withStatus(current, status));
    return ProfessorLinkResult(linkId: linkId, status: status);
  }

  @override
  Future<ProfessorLinkResult> cancelRequest(String linkId) async {
    cancelCalls.add(linkId);
    final error = cancelError;
    if (error != null) throw error;
    final current = _find(linkId);
    if (current != null) {
      _replace(linkId, _withStatus(current, ArenaProfessorLinkStatus.canceled));
    }
    return ProfessorLinkResult(
      linkId: linkId,
      status: ArenaProfessorLinkStatus.canceled,
    );
  }

  @override
  Future<ProfessorLinkResult> endLink({
    required String linkId,
    String? reason,
  }) async {
    endCalls.add((linkId: linkId, reason: reason));
    final error = endError;
    if (error != null) throw error;
    final current = _find(linkId);
    if (current != null) {
      _replace(linkId, _withStatus(current, ArenaProfessorLinkStatus.ended));
    }
    return ProfessorLinkResult(
      linkId: linkId,
      status: ArenaProfessorLinkStatus.ended,
    );
  }

  ArenaProfessorLink _withStatus(
    ArenaProfessorLink link,
    ArenaProfessorLinkStatus status,
  ) =>
      professorLink(
        arenaId: link.arenaId,
        arenaName: link.arenaName,
        type: link.type,
        status: status,
        initiatedBy: link.initiatedBy ?? ArenaProfessorSide.arena,
        permissions: link.permissions,
        approvedAt: status == ArenaProfessorLinkStatus.active
            ? professorTestNow
            : link.approvedAt,
        endedAt:
            status == ArenaProfessorLinkStatus.ended ? professorTestNow : null,
        endedBySide: status == ArenaProfessorLinkStatus.ended
            ? ArenaProfessorSide.professor
            : null,
        updatedAt: professorTestNow,
      );
}

// ── fontes reais ────────────────────────────────────────────────────────────

/// Sora e JetBrains Mono do app: sem elas o teste mede texto com a fonte de
/// teste (bem mais larga) e acusa estouro que não existe. Chamar no `setUpAll`.
Future<void> loadProfessorLinksFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  final sora = FontLoader('Sora')
    ..addFont(rootBundle.load('assets/fonts/Sora/Sora-Variable.ttf'));
  final mono = FontLoader('JetBrains Mono');
  for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
    mono.addFont(
      rootBundle.load('assets/fonts/JetBrainsMono/JetBrainsMono-$weight.ttf'),
    );
  }
  await Future.wait([sora.load(), mono.load()]);
}

// ── app mínimo com as rotas reais da feature ───────────────────────────────

/// Página da arena de teste: só as duas peças da feature, sem o resto da
/// página real (que depende de Firestore, localização, reputação…).
const professorTestArenaRoute = '/arena-teste';

class _TestArenaPage extends StatelessWidget {
  const _TestArenaPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Text('Praia Viva Arena'),
          ArenaPublicProfessorsSection(arenaId: 'praia-viva'),
          ArenaProfessorLinkCard(
            arenaId: 'praia-viva',
            arenaName: 'Praia Viva Arena',
          ),
        ],
      ),
    );
  }
}

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

/// Monta o app com GoRouter (rotas e nomes reais da feature) sobre o [repo].
/// A sessão é [uid] (vazio = deslogado). Largura de iPhone (390) para pegar
/// estouro; altura alta para a lista montar tudo de uma vez.
Future<GoRouter> pumpProfessorLinksApp(
  WidgetTester tester, {
  required FakeProfessorLinksRepository repo,
  required String location,
  String uid = professorTestUid,
  Size size = const Size(390, 1600),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.home,
        name: AppRouteNames.home,
        builder: (_, __) => _stub('home'),
      ),
      GoRoute(
        path: AppRoutes.discover,
        name: AppRouteNames.discover,
        builder: (_, state) => _stub('descobrir ${state.uri.query}'),
      ),
      GoRoute(
        path: professorTestArenaRoute,
        builder: (_, __) => const _TestArenaPage(),
      ),
      GoRoute(
        path: AppRoutes.arenaDetail,
        name: AppRouteNames.arenaDetail,
        builder: (_, state) =>
            _stub('arena ${state.pathParameters['arenaId']}'),
      ),
      GoRoute(
        path: AppRoutes.athleteProfile,
        name: AppRouteNames.athleteProfile,
        builder: (_, state) =>
            _stub('perfil ${state.uri.queryParameters['userId']}'),
      ),
      GoRoute(
        path: AppRoutes.professorArenas,
        name: AppRouteNames.professorArenas,
        builder: (_, __) => const ProfessorMyArenasPage(),
      ),
      GoRoute(
        path: AppRoutes.professorArenaLink,
        name: AppRouteNames.professorArenaLink,
        builder: (_, state) => ProfessorLinkDetailPage(
          linkId: state.pathParameters['linkId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorLinkRequestSent,
        name: AppRouteNames.professorLinkRequestSent,
        builder: (_, state) => ProfessorLinkRequestSentPage(
          linkId: state.pathParameters['linkId'] ?? '',
        ),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksRepositoryProvider.overrideWithValue(repo),
        professorLinksUidProvider.overrideWithValue(uid),
        professorLinksClockProvider.overrideWithValue(() => professorTestNow),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settleProfessorLinks(tester);
  return router;
}

/// Deixa streams e callables responderem. Sem `pumpAndSettle`: os
/// indicadores de carregamento giram para sempre.
Future<void> settleProfessorLinks(WidgetTester tester, [int frames = 8]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Espera a folha (bottom sheet) ou o diálogo terminar de abrir ou fechar.
Future<void> settleProfessorSheet(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}
