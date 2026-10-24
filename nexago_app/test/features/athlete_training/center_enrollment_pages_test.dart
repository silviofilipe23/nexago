import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete_training/domain/center_enrollment_request.dart'
    show kCenterPauseSeatReleaseText;
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
  final clearances = <Map<String, Object?>>[];
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
    bool retainDiscount = false,
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
      'retainDiscount': retainDiscount,
    });
    return (
      requestId: 'new',
      status: retainDiscount || retainPlanId != null
          ? 'retained'
          : type == 'injury'
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
  Future<String> submitMedicalClearance({
    required String centerId,
    required String requestId,
    required CenterCertificateUpload clearance,
  }) async {
    clearances.add({
      'requestId': requestId,
      ...clearance.toMap()..remove('daysOff'),
    });
    return 'submitted';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

MyTrainingCentersData _data({
  List<Map<String, Object?>> requests = const [],
  Map<String, Object?> policies = const {},
  Map<String, Object?> enrollment = const {},
}) =>
    MyTrainingCentersData(
      centers: [
        TrainingCenterLink.fromMap(
          centerJson(
            requests: requests,
            policies: policies,
            enrollment: enrollment,
          ),
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

  // ── desconto de retenção ────────────────────────────────────────────────

  testWidgets('T9 · desconto de 1 mês: valor com desconto e aviso', (
    tester,
  ) async {
    final repo = _FakeCenters(
      _data(
        policies: {
          'cancelRetention': ['discount', 'plan_change'],
          'retentionDiscountPercent': 20,
        },
        enrollment: {'discountAvailable': true},
      ),
    );
    final router = await _pump(tester, location: '$_base/cancelar', repo: repo);
    await _tap(tester, find.byKey(const Key('center-cancel-reason-price')));
    await _tap(tester, find.byKey(const Key('center-cancel-continue')));
    expect(
      find.text('Fique com 20% de desconto na próxima mensalidade'),
      findsOneWidget,
    );
    expect(find.textContaining('256,00'), findsOneWidget);
    expect(find.textContaining('mensalidade de 05 nov'), findsOneWidget);
    expect(find.text('Ficar com 20% de desconto'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-cancel-accept')));
    final sent = repo.requests.single;
    expect(sent['retainDiscount'], isTrue);
    expect(sent['retainPlanId'], isNull);
    expect(sent['retentionOffered'], ['plan_change', 'discount']);
    expect(
      find.text('Desconto aplicado na mensalidade de 05 nov.'),
      findsOneWidget,
    );
    expect(router.state.uri.path, _base);
  });

  testWidgets('T9 · desconto já usado no ano não aparece', (tester) async {
    final repo = _FakeCenters(
      _data(
        policies: {
          'cancelRetention': ['discount', 'plan_change'],
        },
      ),
    );
    await _pump(tester, location: '$_base/cancelar', repo: repo);
    await _tap(tester, find.byKey(const Key('center-cancel-reason-price')));
    await _tap(tester, find.byKey(const Key('center-cancel-continue')));
    expect(
      find.byKey(const Key('center-cancel-offer-discount')),
      findsNothing,
    );
  });

  testWidgets('T5 · histórico mostra o retido com desconto', (tester) async {
    final repo = _FakeCenters(
      _data(
        requests: [
          requestJson(
            id: 'd1',
            type: 'cancel',
            status: 'retained',
            extra: {
              'retainedDiscountPercent': 20,
              'effectiveFrom': '2026-11-05',
              'startsOn': null,
              'endsOn': null,
              'days': null,
            },
          ),
        ],
      ),
    );
    await _pump(tester, location: _base, repo: repo);
    expect(
      find.text('Ficou com desconto · 20% na mensalidade de 05 nov'),
      findsOneWidget,
    );
  });

  // ── alta médica ─────────────────────────────────────────────────────────

  Map<String, Object?> activeInjury(Map<String, Object?> extra) => requestJson(
        status: 'active',
        extra: {'requireClearance': true, 'clearanceStatus': '', ...extra},
      );

  testWidgets('T6 · centro exige alta: aviso no pedido', (tester) async {
    await _pump(
      tester,
      location: '$_base/lesao',
      repo: _FakeCenters(_data(policies: {'requireMedicalClearance': true})),
    );
    expect(
      find.text(
        'Para voltar, o centro pede a alta médica (3 dias antes do fim).',
      ),
      findsOneWidget,
    );
  });

  testWidgets('T6 · sem exigência, sem aviso', (tester) async {
    await _pump(tester, location: '$_base/lesao', repo: _FakeCenters(_data()));
    expect(
      find.byKey(const Key('center-injury-clearance-note')),
      findsNothing,
    );
  });

  testWidgets('T5 · alta pedida: anexa, informa a data e envia', (
    tester,
  ) async {
    final repo = _FakeCenters(
      _data(
        enrollment: {'status': 'paused'},
        requests: [
          activeInjury({'clearanceStatus': 'requested'}),
        ],
      ),
    );
    await _pump(
      tester,
      location: _base,
      repo: repo,
      picker: (_) async => PickedCertificate(
        bytes: Uint8List.fromList(List.filled(1024, 1)),
        fileName: 'alta.jpg',
        contentType: 'image/jpeg',
      ),
    );
    expect(find.text('Envie sua alta médica'), findsOneWidget);
    expect(find.text('Anexe a alta'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-clearance-camera')));
    expect(find.byKey(const Key('center-clearance-file')), findsOneWidget);
    await _tap(tester, find.byKey(const Key('center-clearance-send')));
    expect(
      repo.uploads.single,
      startsWith('trainingCenterCertificates/ct1/me/'),
    );
    final sent = repo.clearances.single;
    expect(sent['requestId'], 'r1');
    expect(sent['contentType'], 'image/jpeg');
    expect(sent['issuedOn'], '2026-10-24');
    expect(sent.containsKey('daysOff'), isFalse);
    expect(
      find.text('Alta enviada. O centro revisa e avisa pelo app.'),
      findsOneWidget,
    );
  });

  testWidgets('T5 · faltando 3 dias, mesmo sem pedido do servidor', (
    tester,
  ) async {
    await _pump(
      tester,
      location: _base,
      repo: _FakeCenters(
        _data(requests: [
          activeInjury({'endsOn': '2026-10-27'})
        ]),
      ),
    );
    expect(find.text('Envie sua alta médica'), findsOneWidget);
  });

  testWidgets('T5 · longe do fim: só o aviso', (tester) async {
    await _pump(
      tester,
      location: _base,
      repo: _FakeCenters(_data(requests: [activeInjury({})])),
    );
    expect(find.text('O centro pede a alta para voltar'), findsOneWidget);
    expect(find.byKey(const Key('center-clearance-send')), findsNothing);
  });

  testWidgets('T5 · volta segurada esperando a alta', (tester) async {
    await _pump(
      tester,
      location: _base,
      repo: _FakeCenters(
        _data(
          requests: [
            activeInjury({
              'clearanceStatus': 'requested',
              'awaitingClearance': true,
              'endsOn': '2026-10-22',
            }),
          ],
        ),
      ),
    );
    expect(find.text('Sua volta espera a alta'), findsOneWidget);
    expect(
      find.textContaining('A pausa segue sem cobrança até o centro aprovar'),
      findsOneWidget,
    );
    expect(find.text('Envie sua alta médica'), findsOneWidget);
  });

  testWidgets('T5 · alta enviada fica em análise', (tester) async {
    await _pump(
      tester,
      location: _base,
      repo: _FakeCenters(
        _data(requests: [
          activeInjury({'clearanceStatus': 'submitted'})
        ]),
      ),
    );
    expect(find.text('Alta enviada · em análise'), findsOneWidget);
    expect(find.byKey(const Key('center-clearance-send')), findsNothing);
  });

  group('vaga no trancamento (pauseSeat release)', () {
    const release = {'pauseSeat': 'release'};
    Map<String, Object?> activePause(Map<String, Object?> extra) => requestJson(
          id: 'r8',
          type: 'pause',
          status: 'active',
          extra: {
            'hasCertificate': false,
            'reason': 'Viagem',
            'startsOn': '2026-10-01',
            'endsOn': '2026-10-30',
            'releaseSeat': true,
            ...extra,
          },
        );

    testWidgets('T5 · opção avisa que a vaga volta para a turma', (
      tester,
    ) async {
      await _pump(
        tester,
        location: _base,
        repo: _FakeCenters(_data(policies: release)),
      );
      expect(
        find.text('50 dias livres no ano · a vaga volta para a turma'),
        findsOneWidget,
      );
      expect(find.text('50 dias livres no ano · vaga reservada'), findsNothing);
    });

    testWidgets('trancar: formulário e confirmação com a regra da vaga', (
      tester,
    ) async {
      final repo = _FakeCenters(_data(policies: release));
      await _pump(tester, location: '$_base/trancar', repo: repo);
      expect(
        find.textContaining(kCenterPauseSeatReleaseText),
        findsOneWidget,
      );
      expect(find.textContaining('fica reservada'), findsNothing);
      await _tap(tester, find.byKey(const Key('center-pause-review')));
      expect(find.text('Volta para a turma'), findsOneWidget);
      expect(find.text('Fica reservada'), findsNothing);
      expect(
        find.byKey(const Key('center-pause-confirm-seat-release')),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('center-pause-confirm')));
      expect(repo.requests.single['type'], 'pause');
    });

    testWidgets('trancar: centro que reserva segue como antes', (
      tester,
    ) async {
      await _pump(
        tester,
        location: '$_base/trancar',
        repo: _FakeCenters(_data()),
      );
      expect(find.textContaining('Sua vaga fica reservada.'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-pause-review')));
      expect(find.text('Fica reservada'), findsOneWidget);
      expect(
        find.byKey(const Key('center-pause-confirm-seat-release')),
        findsNothing,
      );
    });

    testWidgets('T9 · oferta de trancar com a vaga voltando para a turma', (
      tester,
    ) async {
      await _pump(
        tester,
        location: '$_base/cancelar',
        repo: _FakeCenters(_data(policies: release)),
      );
      await _tap(tester, find.byKey(const Key('center-cancel-reason-price')));
      await _tap(tester, find.byKey(const Key('center-cancel-continue')));
      expect(
        find.text('Sem cobrança · $kCenterPauseSeatReleaseText'),
        findsOneWidget,
      );
      expect(find.text('Sem cobrança e com a vaga guardada'), findsNothing);
    });

    testWidgets('T5 · trancamento em curso que liberou a vaga', (
      tester,
    ) async {
      await _pump(
        tester,
        location: _base,
        repo: _FakeCenters(
          _data(
            policies: release,
            requests: [activePause(const {})],
            enrollment: {'status': 'paused', 'pausedUntil': '2026-10-31'},
          ),
        ),
      );
      expect(find.text('Volta em 31 out'), findsOneWidget);
      expect(
        find.textContaining(kCenterPauseSeatReleaseText),
        findsOneWidget,
      );
      expect(find.text('Volta para a turma'), findsOneWidget);
      expect(find.textContaining('Sua vaga está reservada'), findsNothing);
    });

    testWidgets('T5 · turma cheia: volta na primeira vaga, sem cobrança', (
      tester,
    ) async {
      await _pump(
        tester,
        location: _base,
        repo: _FakeCenters(
          _data(
            policies: release,
            requests: [
              activePause({'awaitingSeat': true, 'pausedUntil': '2026-10-25'}),
            ],
            enrollment: {'status': 'paused', 'pausedUntil': '2026-10-25'},
          ),
        ),
      );
      expect(
        find.text('Turma cheia · você volta na primeira vaga'),
        findsOneWidget,
      );
      expect(find.text('Sem cobrança enquanto isso'), findsOneWidget);
      expect(find.text('PAUSADA · TURMA CHEIA'), findsOneWidget);
      expect(
          find.textContaining('volta em 25 out'.toUpperCase()), findsNothing);
      // Trancamento em curso ainda deixa cancelar.
      expect(find.byKey(const Key('center-enrollment-cancel')), findsOneWidget);
    });

    testWidgets('T5 · lesão continua com a vaga reservada', (tester) async {
      await _pump(
        tester,
        location: _base,
        repo: _FakeCenters(
          _data(
            policies: release,
            requests: [
              requestJson(status: 'active', extra: {'releaseSeat': true}),
            ],
          ),
        ),
      );
      expect(
        find.text('Sem aulas nem cobrança até lá. Sua vaga está reservada.'),
        findsOneWidget,
      );
      expect(find.text('Volta para a turma'), findsNothing);
    });
  });
}
