import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/center_certificate_picker.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/class_presence_repository.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/training_centers_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_center_enrollment_pages.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import 'center_enrollment_request_test.dart' show centerJson, requestJson;

// Sáb 24/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 24, 15);

class _FakeCenters implements TrainingCentersRepository {
  _FakeCenters(this.data);

  MyTrainingCentersData data;
  final requests = <Map<String, Object?>>[];
  final withdrawn = <String>[];
  final uploads = <String>[];
  ClassPresenceException? requestError;

  @override
  Future<MyTrainingCentersData> fetch() async => data;

  @override
  Future<CenterRequestResult> requestEnrollmentChange({
    required String centerId,
    required String enrollmentId,
    required String type,
    String? startsOn,
    int? days,
    String reason = '',
    String comment = '',
    CenterCertificateUpload? certificate,
    List<String> retentionOffered = const [],
    String? retainPlanId,
  }) async {
    if (requestError != null) throw requestError!;
    requests.add({
      'centerId': centerId,
      'enrollmentId': enrollmentId,
      'type': type,
      'startsOn': startsOn,
      'days': days,
      'reason': reason,
      'certificate': certificate?.toMap(),
      'retentionOffered': retentionOffered,
      'retainPlanId': retainPlanId,
    });
    return (
      requestId: 'new',
      status: type == 'injury'
          ? 'pending'
          : type == 'pause'
              ? 'active'
              : 'scheduled',
      startsOn: startsOn,
      endsOn: '2026-10-30',
      lastDay: type == 'cancel' ? '2026-11-04' : null,
    );
  }

  @override
  Future<void> withdrawEnrollmentRequest({
    required String centerId,
    required String requestId,
  }) async =>
      withdrawn.add(requestId);

  @override
  Future<String> uploadCertificate({
    required String centerId,
    required String uid,
    required Uint8List bytes,
    required String fileName,
    required String contentType,
  }) async {
    final path = 'trainingCenterCertificates/$centerId/$uid/1-$fileName';
    uploads.add(path);
    return path;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

MyTrainingCentersData _data({
  List<Map<String, Object?>> requests = const [],
  Map<String, Object?> policies = const {},
}) =>
    MyTrainingCentersData(
      centers: [
        TrainingCenterLink.fromMap(
          centerJson(requests: requests, policies: policies),
        ),
      ],
    );

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

Future<GoRouter> _pump(
  WidgetTester tester, {
  required String location,
  required _FakeCenters repo,
  CertificatePicker? picker,
}) async {
  tester.view.physicalSize = const Size(400, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  GoRoute page(
    String path,
    String name,
    Widget Function(String c, String e) build, {
    List<RouteBase> routes = const [],
  }) =>
      GoRoute(
        path: path,
        name: name,
        builder: (_, s) => build(
          s.pathParameters['centerId']!,
          s.pathParameters['enrollmentId']!,
        ),
        routes: routes,
      );
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.athleteTrainings,
        name: AppRouteNames.athleteTrainings,
        builder: (_, __) => _stub('hub'),
        routes: [
          GoRoute(
            path: 'centro/:centerId',
            name: AppRouteNames.athleteTrainingCenter,
            builder: (_, __) => _stub('centro'),
            routes: [
              page(
                'matricula/:enrollmentId',
                AppRouteNames.athleteTrainingCenterEnrollment,
                (c, e) =>
                    AthleteCenterEnrollmentPage(centerId: c, enrollmentId: e),
                routes: [
                  page(
                    'trancar',
                    AppRouteNames.athleteTrainingCenterEnrollmentPause,
                    (c, e) =>
                        AthleteCenterPausePage(centerId: c, enrollmentId: e),
                  ),
                  page(
                    'lesao',
                    AppRouteNames.athleteTrainingCenterEnrollmentInjury,
                    (c, e) =>
                        AthleteCenterInjuryPage(centerId: c, enrollmentId: e),
                  ),
                  page(
                    'cancelar',
                    AppRouteNames.athleteTrainingCenterEnrollmentCancel,
                    (c, e) =>
                        AthleteCenterCancelPage(centerId: c, enrollmentId: e),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('me'),
        professorLinksClockProvider.overrideWithValue(() => _now),
        trainingCentersRepositoryProvider.overrideWithValue(repo),
        if (picker != null)
          centerCertificatePickerProvider.overrideWithValue(picker),
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

const _base = '/treinos/centro/ct1/matricula/e1';

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  testWidgets('T5 · sem pedido: opções com dias livres e aviso do ciclo', (
    tester,
  ) async {
    await _pump(tester, location: _base, repo: _FakeCenters(_data()));
    expect(find.text('BT Feminino Manhã'), findsOneWidget);
    expect(find.text('Ativa desde 05 mar'.toUpperCase()), findsOneWidget);
    expect(find.text('Pausa por lesão'), findsOneWidget);
    expect(find.text('50 dias livres no ano · vaga reservada'), findsOneWidget);
    expect(find.text('Aulas até 04 nov (fim do ciclo pago)'), findsOneWidget);
  });

  testWidgets('trancar: confirma e manda o pedido de hoje', (tester) async {
    final repo = _FakeCenters(_data());
    final router = await _pump(tester, location: _base, repo: repo);
    await _tap(tester, find.byKey(const Key('center-enrollment-pause')));
    expect(router.state.uri.path, '$_base/trancar');
    expect(find.byKey(const Key('center-pause-summary')), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-pause-review')));
    expect(find.byKey(const Key('center-pause-confirm-sheet')), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-pause-confirm')));
    expect(repo.requests.single['type'], 'pause');
    expect(repo.requests.single['days'], 7);
    expect(repo.requests.single['startsOn'], '2026-10-24');
    expect(router.state.uri.path, _base);
  });

  testWidgets('trancar: abaixo do mínimo não deixa revisar', (tester) async {
    final repo = _FakeCenters(_data());
    await _pump(tester, location: '$_base/trancar', repo: repo);
    await tester.enterText(
      find.byKey(const Key('center-pause-days')),
      '3',
    );
    await _settle(tester);
    expect(find.text('O trancamento mínimo é de 7 dias.'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-pause-review')));
    expect(find.byKey(const Key('center-pause-confirm-sheet')), findsNothing);
    expect(repo.requests, isEmpty);
  });

  testWidgets('T6 · lesão: sobe o atestado e manda o pedido', (tester) async {
    final repo = _FakeCenters(_data());
    await _pump(
      tester,
      location: '$_base/lesao',
      repo: repo,
      picker: (_) async => PickedCertificate(
        bytes: Uint8List.fromList(List.filled(2048, 1)),
        fileName: 'atestado.pdf',
        contentType: 'application/pdf',
      ),
    );
    await _tap(tester, find.byKey(const Key('center-injury-pick-file')));
    expect(find.byKey(const Key('center-injury-file')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('center-injury-days')), '30');
    await tester.enterText(
      find.byKey(const Key('center-injury-what')),
      'Entorse no joelho',
    );
    await _settle(tester);
    expect(find.text('24 out a 22 nov'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-injury-send')));
    expect(
        repo.uploads.single, startsWith('trainingCenterCertificates/ct1/me/'));
    final sent = repo.requests.single;
    expect(sent['type'], 'injury');
    expect(sent['days'], 30);
    final cert = sent['certificate'] as Map<String, Object?>;
    expect(cert['contentType'], 'application/pdf');
    expect(cert['issuedOn'], '2026-10-24');
    expect(cert['daysOff'], 30);
    expect(cert['description'], 'Entorse no joelho');
  });

  testWidgets('T7 · atestado em análise no lugar das opções', (tester) async {
    final repo = _FakeCenters(_data(requests: [requestJson()]));
    await _pump(tester, location: _base, repo: repo);
    expect(find.text('Atestado enviado'), findsOneWidget);
    expect(find.text('Em análise'), findsOneWidget);
    expect(find.byKey(const Key('center-enrollment-pause')), findsNothing);
    await _tap(tester, find.byKey(const Key('center-enrollment-withdraw')));
    expect(repo.withdrawn, ['r1']);
  });

  testWidgets('documento pedido: recado da gestão e reenviar', (tester) async {
    final repo = _FakeCenters(
      _data(
        requests: [
          requestJson(
            status: 'needs_document',
            extra: {'decisionNote': 'Precisa ter a data.'},
          ),
        ],
      ),
    );
    final router = await _pump(tester, location: _base, repo: repo);
    expect(find.text('Precisa ter a data.'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-enrollment-resend')));
    expect(router.state.uri.path, '$_base/lesao');
  });

  testWidgets('T8/T9 · motivo, ofertas e cancelar mesmo assim', (
    tester,
  ) async {
    final repo = _FakeCenters(_data());
    final router = await _pump(
      tester,
      location: '$_base/cancelar',
      repo: repo,
    );
    expect(find.text('Por que você quer sair?'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-cancel-reason-price')));
    await _tap(tester, find.byKey(const Key('center-cancel-continue')));
    expect(find.text('Antes de ir, alguma destas ajuda?'), findsOneWidget);
    expect(find.text('Trocar para Mensal 1x'), findsWidgets);
    expect(find.text('Trancar por até 50 dias'), findsOneWidget);
    expect(find.text('04 nov'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-cancel-confirm')));
    final sent = repo.requests.single;
    expect(sent['type'], 'cancel');
    expect(sent['reason'], 'price');
    expect(sent['retentionOffered'], ['pause', 'plan_change']);
    expect(sent['retainPlanId'], isNull);
    expect(router.state.uri.path, _base);
  });

  testWidgets('T9 · aceitar a troca de plano manda o retainPlanId', (
    tester,
  ) async {
    final repo = _FakeCenters(_data());
    await _pump(tester, location: '$_base/cancelar', repo: repo);
    await _tap(tester, find.byKey(const Key('center-cancel-reason-schedule')));
    await _tap(tester, find.byKey(const Key('center-cancel-continue')));
    await _tap(tester, find.byKey(const Key('center-cancel-accept')));
    expect(repo.requests.single['retainPlanId'], 'p1x');
  });

  testWidgets('T10 · cancelamento agendado e desistir', (tester) async {
    final repo = _FakeCenters(
      _data(
        requests: [
          requestJson(
            id: 'c9',
            type: 'cancel',
            status: 'scheduled',
            extra: {
              'lastDay': '2026-11-04',
              'reason': 'Preço',
              'startsOn': null,
              'endsOn': null,
              'days': null,
            },
          ),
        ],
      ),
    );
    await _pump(tester, location: _base, repo: repo);
    expect(find.text('Suas aulas vão até 04 nov'), findsOneWidget);
    expect(find.text('Desistir do cancelamento'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-enrollment-withdraw')));
    expect(repo.withdrawn, ['c9']);
  });

  testWidgets('T10 · centro sem desistência pelo app', (tester) async {
    final repo = _FakeCenters(
      _data(
        policies: {'allowCancelWithdraw': false},
        requests: [
          requestJson(
            type: 'cancel',
            status: 'scheduled',
            extra: {'lastDay': '2026-11-04'},
          ),
        ],
      ),
    );
    await _pump(tester, location: _base, repo: repo);
    expect(find.byKey(const Key('center-enrollment-withdraw')), findsNothing);
    expect(
      find.textContaining('fale com a recepção'),
      findsOneWidget,
    );
  });
}
