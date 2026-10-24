import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/center_coach/application/center_coach_providers.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_exit_requests.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_exit_requests_repository.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_exit_requests_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import 'center_exit_requests_test.dart' show exitJson;

class _FakeRequests implements CenterExitRequestsRepository {
  _FakeRequests(this.items);

  final List<CenterExitRequest> items;
  final decisions = <String>[];

  @override
  Stream<List<CenterExitRequest>> watch(String centerId) => Stream.value(items);

  @override
  Future<String> decide({
    required String centerId,
    required String requestId,
    required String decision,
    String note = '',
  }) async {
    decisions.add('$requestId $decision${note.isEmpty ? '' : ' $note'}');
    return decision == 'approve' ? 'active' : decision;
  }

  @override
  Future<String> certificateUrl(String path) async =>
      'https://example.test/$path';
}

CenterMembership _m(String role) => CenterMembership(
      centerId: 'ct1',
      centerName: 'CT Maré Alta',
      role: role,
      status: 'active',
    );

Future<GoRouter> _pump(
  WidgetTester tester, {
  required String location,
  required _FakeRequests repo,
  String role = 'center_owner',
}) async {
  tester.view.physicalSize = const Size(400, 2000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.centerCoachExitRequests,
        name: AppRouteNames.centerCoachExitRequests,
        builder: (_, s) => CenterCoachExitRequestsPage(
          centerId: s.pathParameters['centerId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachExitRequest,
        name: AppRouteNames.centerCoachExitRequest,
        builder: (_, s) => CenterCoachExitRequestPage(
          centerId: s.pathParameters['centerId']!,
          requestId: s.pathParameters['requestId']!,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('owner'),
        professorLinksClockProvider.overrideWithValue(
          () => DateTime.utc(2026, 10, 24, 15),
        ),
        centerMembershipProvider.overrideWith((ref, id) => _m(role)),
        centerExitRequestsRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await _settle(tester);
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await _settle(tester);
}

_FakeRequests _repo() => _FakeRequests([
      CenterExitRequest.fromMap('r1', exitJson()),
      CenterExitRequest.fromMap(
        'r2',
        exitJson(
          type: 'cancel',
          status: 'scheduled',
          extra: {
            'studentName': 'Lucas Prado',
            'reason': 'moving',
            'lastDay': '2026-11-04',
            'certificate': null,
          },
        ),
      ),
    ]);

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  testWidgets('lista: a revisar e em andamento; toque abre o pedido', (
    tester,
  ) async {
    final router = await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos',
      repo: _repo(),
    );
    expect(find.text('A REVISAR · 1'), findsOneWidget);
    expect(find.text('EM ANDAMENTO · 1'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-exit-row-r1')));
    expect(router.state.uri.path, '/athlete/professor/centros/ct1/pedidos/r1');
  });

  testWidgets('T11 · atestado em PDF, dados e aprovar', (tester) async {
    final repo = _repo();
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r1',
      repo: repo,
    );
    expect(find.byKey(const Key('center-exit-certificate')), findsOneWidget);
    expect(find.text('atestado.pdf'), findsOneWidget);
    expect(find.text('23 out'), findsOneWidget);
    expect(find.text('30 dias'), findsOneWidget);
    expect(find.text('Entorse no joelho'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-exit-approve')));
    expect(repo.decisions, ['r1 approve']);
  });

  testWidgets('recusar pede o recado ao aluno', (tester) async {
    final repo = _repo();
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r1',
      repo: repo,
    );
    await _tap(tester, find.byKey(const Key('center-exit-reject')));
    expect(find.byKey(const Key('center-exit-note-sheet')), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-exit-note-send')));
    expect(repo.decisions, isEmpty, reason: 'sem recado não envia');
    await tester.enterText(
      find.byKey(const Key('center-exit-note')),
      'Atestado ilegível',
    );
    await _settle(tester);
    await _tap(tester, find.byKey(const Key('center-exit-note-send')));
    expect(repo.decisions, ['r1 reject Atestado ilegível']);
  });

  testWidgets('cancelamento agendado: desfazer', (tester) async {
    final repo = _repo();
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r2',
      repo: repo,
    );
    expect(find.text('Mudança de cidade'), findsOneWidget);
    expect(find.byKey(const Key('center-exit-approve')), findsNothing);
    await _tap(tester, find.byKey(const Key('center-exit-undo')));
    await _tap(tester, find.byKey(const Key('center-exit-note-send')));
    expect(repo.decisions, ['r2 undo']);
  });

  testWidgets('recepção vê, mas não decide nem abre o atestado', (
    tester,
  ) async {
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r1',
      repo: _repo(),
      role: 'receptionist',
    );
    expect(find.text('Entorse no joelho'), findsOneWidget);
    expect(find.byKey(const Key('center-exit-approve')), findsNothing);
    expect(find.byKey(const Key('center-exit-certificate')), findsNothing);
    expect(
      find.text('Só owner ou admin decidem este pedido.'),
      findsOneWidget,
    );
  });

  // ── alta médica ─────────────────────────────────────────────────────────

  _FakeRequests clearanceRepo(Map<String, Object?> extra) => _FakeRequests([
        CenterExitRequest.fromMap(
          'r3',
          exitJson(
            status: 'active',
            extra: {
              'requireClearance': true,
              'clearanceStatus': 'submitted',
              'clearance': {
                'path': 'trainingCenterCertificates/ct1/u1/2-alta.pdf',
                'fileName': 'alta.pdf',
                'contentType': 'application/pdf',
                'sizeBytes': 2048,
                'issuedOn': '2026-11-20',
              },
              ...extra,
            },
          ),
        ),
      ]);

  testWidgets('lista: alta enviada vai para "a revisar"', (tester) async {
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos',
      repo: clearanceRepo(const {}),
    );
    expect(find.text('A REVISAR · 1'), findsOneWidget);
    expect(find.text('REVISAR ALTA'), findsOneWidget);
  });

  testWidgets('T11 · alta enviada: arquivo e "Aprovar alta"', (tester) async {
    final repo = clearanceRepo(const {});
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r3',
      repo: repo,
    );
    expect(find.byKey(const Key('center-exit-clearance')), findsOneWidget);
    expect(find.text('Enviada · revisar'), findsOneWidget);
    expect(
      find.byKey(const Key('center-exit-clearance-file')),
      findsOneWidget,
    );
    expect(find.text('alta.pdf'), findsOneWidget);
    expect(find.text('Aprovar alta'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-exit-clear')));
    expect(find.byKey(const Key('center-exit-note-sheet')), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-exit-note-send')));
    expect(repo.decisions, ['r3 clear']);
  });

  testWidgets('T11 · volta segurada sem alta: liberar sem alta com recado', (
    tester,
  ) async {
    final repo = clearanceRepo({
      'clearanceStatus': 'requested',
      'clearance': null,
      'awaitingClearance': true,
    });
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r3',
      repo: repo,
    );
    expect(find.text('ESPERANDO ALTA'), findsOneWidget);
    expect(find.textContaining('a volta espera a alta'), findsOneWidget);
    expect(find.text('Liberar sem alta'), findsWidgets);
    await _tap(tester, find.byKey(const Key('center-exit-clear')));
    await tester.enterText(
      find.byKey(const Key('center-exit-note')),
      'Liberado pelo fisio',
    );
    await _settle(tester);
    await _tap(tester, find.byKey(const Key('center-exit-note-send')));
    expect(repo.decisions, ['r3 clear Liberado pelo fisio']);
  });

  testWidgets('T11 · recepção vê a situação da alta, não o arquivo', (
    tester,
  ) async {
    await _pump(
      tester,
      location: '/athlete/professor/centros/ct1/pedidos/r3',
      repo: clearanceRepo(const {}),
      role: 'receptionist',
    );
    expect(find.text('Enviada · revisar'), findsOneWidget);
    expect(find.byKey(const Key('center-exit-clearance-file')), findsNothing);
    expect(find.byKey(const Key('center-exit-clear')), findsNothing);
  });
}
