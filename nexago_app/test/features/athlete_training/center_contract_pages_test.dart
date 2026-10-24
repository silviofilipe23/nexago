import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/class_presence_repository.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/training_centers_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_center_contract_pages.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_center_invoice_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import 'center_contract_test.dart' show contractJson;

// Sáb 24/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 24, 15);

final _longBody = [
  for (var i = 1; i <= 40; i++)
    '# $i. Cláusula\nTexto da cláusula $i com as regras do centro, a '
        'mensalidade, a reposição e o cancelamento, longo o bastante para '
        'ocupar algumas linhas na folha do contrato.',
].join('\n\n');

/// Repositório do CT em memória: grava as chamadas dos contratos.
class _FakeCenters implements TrainingCentersRepository {
  _FakeCenters(this.data);

  MyTrainingCentersData data;
  final calls = <String>[];
  Map<String, Object?>? lastSign;
  ClassPresenceException? signError;

  @override
  Future<MyTrainingCentersData> fetch() async => data;

  @override
  Future<String> openContract({
    required String centerId,
    required String contractId,
  }) async {
    calls.add('open $contractId');
    return 'viewed';
  }

  @override
  Future<CenterContractSignResult> signContract({
    required String centerId,
    required String contractId,
    required bool accept,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
  }) async {
    calls.add('sign $contractId ${accept ? 'accept' : 'decline'}');
    if (signError != null) throw signError!;
    lastSign = {
      'sha256': sha256,
      'readSeconds': readSeconds,
      'platform': platform,
      'appVersion': appVersion,
    };
    return (
      status: accept ? 'signed' : 'declined',
      number: 'CTR-2026-0512',
      signedAt: DateTime.utc(2026, 10, 24, 17, 31),
    );
  }

  @override
  Future<CenterInvoicePix> invoicePix({
    required String centerId,
    required String invoiceId,
  }) async {
    calls.add('pix $invoiceId');
    return const CenterInvoicePix(status: 'pending', pixPayload: 'PIX');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

MyTrainingCentersData _data({
  List<Map<String, Object?>>? contracts,
  bool blocked = true,
}) =>
    MyTrainingCentersData(
      centers: [
        TrainingCenterLink.fromMap({
          'centerId': 'ct1',
          'name': 'CT Maré Alta',
          'enrollments': [
            {
              'enrollmentId': 'e1',
              'classId': 'c1',
              'className': 'BT Iniciante A',
              'status': 'pending',
            },
          ],
          'invoices': [
            {
              'invoiceId': 'i1',
              'reference': 'Matrícula',
              'amountCents': 8000,
              'dueDate': '2026-10-30',
              'status': 'pending',
              'enrollmentId': 'e1',
              'blockedByContract': blocked,
            },
          ],
          'contracts': contracts ??
              [
                contractJson(),
                contractJson(
                  id: 'k2',
                  kind: 'term',
                  optional: true,
                  status: 'sent',
                ),
                contractJson(
                  id: 'k0',
                  kind: 'term',
                  status: 'signed',
                  signedAt: '2026-10-20T12:00:00Z',
                ),
              ],
        }),
      ],
    );

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

Future<GoRouter> _pump(
  WidgetTester tester, {
  required String location,
  required _FakeCenters repo,
  Size size = const Size(400, 2400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
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
              GoRoute(
                path: 'fatura/:invoiceId',
                name: AppRouteNames.athleteTrainingCenterInvoice,
                builder: (_, s) => AthleteTrainingCenterInvoicePage(
                  centerId: s.pathParameters['centerId']!,
                  invoiceId: s.pathParameters['invoiceId']!,
                ),
              ),
              GoRoute(
                path: 'contratos',
                name: AppRouteNames.athleteTrainingCenterContracts,
                builder: (_, s) => AthleteTrainingCenterContractsPage(
                  centerId: s.pathParameters['centerId']!,
                ),
              ),
              GoRoute(
                path: 'contrato/:contractId/assinar',
                name: AppRouteNames.athleteTrainingCenterContractSign,
                builder: (_, s) => AthleteTrainingCenterContractSignPage(
                  centerId: s.pathParameters['centerId']!,
                  contractId: s.pathParameters['contractId']!,
                  readSeconds: int.tryParse(
                    s.uri.queryParameters['leitura'] ?? '',
                  ),
                ),
              ),
              GoRoute(
                path: 'contrato/:contractId/assinado',
                name: AppRouteNames.athleteTrainingCenterContractSigned,
                builder: (_, s) => AthleteTrainingCenterContractSignedPage(
                  centerId: s.pathParameters['centerId']!,
                  contractId: s.pathParameters['contractId']!,
                  result: CenterContractSignedArgs.fromQuery(
                    s.uri.queryParameters,
                  ),
                ),
              ),
              GoRoute(
                path: 'contrato/:contractId',
                name: AppRouteNames.athleteTrainingCenterContract,
                builder: (_, s) => AthleteTrainingCenterContractPage(
                  centerId: s.pathParameters['centerId']!,
                  contractId: s.pathParameters['contractId']!,
                ),
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
        contractSignPlatformProvider.overrideWithValue('ios'),
        contractSignAppVersionProvider
            .overrideWith((ref) async => '1.0.15+113'),
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

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('K6 · lista de contratos', () {
    testWidgets('destaque do obrigatório, termo opcional e assinados', (
      tester,
    ) async {
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1/contratos',
        repo: _FakeCenters(_data()),
      );
      expect(
          find.byKey(const Key('center-contracts-featured')), findsOneWidget);
      expect(find.text('Mensal 2x/semana · BT Iniciante A'), findsOneWidget);
      expect(
        find.textContaining('Assine para liberar o pagamento'),
        findsOneWidget,
      );
      expect(find.text('Opcional · você pode recusar'), findsOneWidget);
      expect(find.text('PENDENTE'), findsOneWidget);
      expect(find.text('Assinado 20 out · v3'), findsOneWidget);

      await _tap(
        tester,
        find.byKey(const Key('center-contracts-featured-sign')),
      );
      expect(router.state.uri.path, '/treinos/centro/ct1/contrato/k1');
    });

    testWidgets('sem contratos: aviso', (tester) async {
      await _pump(
        tester,
        location: '/treinos/centro/ct1/contratos',
        repo: _FakeCenters(_data(contracts: const [])),
      );
      expect(find.byKey(const Key('center-contracts-empty')), findsOneWidget);
    });
  });

  group('K7 · leitura', () {
    testWidgets('texto longo: botão travado até rolar até o fim', (
      tester,
    ) async {
      final repo = _FakeCenters(
        _data(contracts: [contractJson(body: _longBody)]),
      );
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k1',
        repo: repo,
        size: const Size(400, 800),
      );
      // Abrir marca "aberto" no servidor (uma vez).
      expect(repo.calls, ['open k1']);
      expect(find.byKey(const Key('contract-essentials')), findsOneWidget);
      expect(find.text('Role até o fim para assinar'), findsOneWidget);
      expect(find.byKey(const Key('contract-read-continue')), findsNothing);
      await tester.tap(find.text('Role até o fim para assinar'));
      await _settle(tester);
      expect(router.state.uri.path, '/treinos/centro/ct1/contrato/k1');

      await tester.drag(
        find.byKey(const Key('contract-read-scroll')),
        const Offset(0, -30000),
      );
      await _settle(tester);
      expect(find.byKey(const Key('contract-read-continue')), findsOneWidget);
      expect(repo.calls, ['open k1']);

      await _tap(tester, find.byKey(const Key('contract-read-continue')));
      expect(router.state.uri.path, '/treinos/centro/ct1/contrato/k1/assinar');
      expect(router.state.uri.queryParameters['leitura'], isNotNull);
    });

    testWidgets('texto curto que cabe na tela já libera', (tester) async {
      await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k1',
        repo: _FakeCenters(_data()),
      );
      expect(find.byKey(const Key('contract-read-continue')), findsOneWidget);
      expect(find.text('Continuar para assinar'), findsOneWidget);
    });

    testWidgets('assinado abre só leitura, com selo e assinaturas', (
      tester,
    ) async {
      final repo = _FakeCenters(_data());
      await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k0',
        repo: repo,
      );
      expect(find.byKey(const Key('contract-seal')), findsOneWidget);
      expect(find.text('Assinatura do centro · 20 out 2026 · 09:00'),
          findsOneWidget);
      expect(find.byKey(const Key('contract-read-continue')), findsNothing);
      expect(find.byKey(const Key('contract-read-locked')), findsNothing);
      expect(repo.calls, isEmpty);
    });
  });

  group('K8 · assinar', () {
    testWidgets('obrigatório: sem recusa; aceite libera e assina', (
      tester,
    ) async {
      final repo = _FakeCenters(_data());
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k1/assinar?leitura=95',
        repo: repo,
      );
      expect(find.text('Não autorizo'), findsNothing);
      expect(
        find.text('Li e concordo com o contrato de matrícula do CT Maré Alta.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Registramos data, hora, dispositivo'),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('contract-sign-submit')));
      expect(repo.calls, isEmpty, reason: 'sem o aceite não assina');

      await _tap(tester, find.byKey(const Key('contract-sign-agree')));
      await _tap(tester, find.byKey(const Key('contract-sign-submit')));
      expect(repo.calls, ['sign k1 accept']);
      expect(repo.lastSign, {
        'sha256': 'abc123',
        'readSeconds': 95,
        'platform': 'ios',
        'appVersion': '1.0.15+113',
      });
      expect(
        router.state.uri.path,
        '/treinos/centro/ct1/contrato/k1/assinado',
      );
      expect(find.text('Contrato assinado'), findsOneWidget);
      expect(find.text('CTR-2026-0512'), findsOneWidget);
      expect(find.text('24 out 2026 · 14:31'), findsOneWidget);
      expect(find.text('Disponível aqui no app'), findsOneWidget);
      expect(find.textContaining('Ir para pagamento'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('contract-signed-pay')));
      expect(router.state.uri.path, '/treinos/centro/ct1/fatura/i1');
    });

    testWidgets('termo opcional: recusa registrada e volta ao centro', (
      tester,
    ) async {
      final repo = _FakeCenters(_data());
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k2/assinar?leitura=12',
        repo: repo,
      );
      expect(find.text('Autorizo'), findsOneWidget);
      expect(find.text('Não autorizo'), findsOneWidget);
      // Aceite só aparece depois de "Autorizo".
      expect(find.byKey(const Key('contract-sign-agree')), findsNothing);
      await _tap(tester, find.byKey(const Key('contract-sign-decline')));
      expect(find.text('Registrar recusa'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('contract-sign-submit')));
      expect(repo.calls, ['sign k2 decline']);
      expect(find.text('Recusa registrada'), findsOneWidget);
      expect(find.text('Não autorizado'), findsOneWidget);
      expect(find.byKey(const Key('contract-signed-pay')), findsNothing);
      await _tap(tester, find.byKey(const Key('contract-signed-back')));
      expect(router.state.uri.path, '/treinos/centro/ct1');
    });

    testWidgets('erro da callable aparece e a tela fica', (tester) async {
      final repo = _FakeCenters(_data())
        ..signError = const ClassPresenceException(
          'O texto mudou desde que você abriu. Abra o contrato de novo.',
        );
      await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k1/assinar?leitura=10',
        repo: repo,
      );
      await _tap(tester, find.byKey(const Key('contract-sign-agree')));
      await _tap(tester, find.byKey(const Key('contract-sign-submit')));
      expect(
        find.text(
          'O texto mudou desde que você abriu. Abra o contrato de novo.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const Key('contract-sign-submit')), findsOneWidget);
    });

    testWidgets('sem passar pela leitura: pede para ler antes', (tester) async {
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1/contrato/k1/assinar',
        repo: _FakeCenters(_data()),
      );
      expect(find.byKey(const Key('contract-sign-submit')), findsNothing);
      await _tap(tester, find.byKey(const Key('contract-sign-read-first')));
      expect(router.state.uri.path, '/treinos/centro/ct1/contrato/k1');
    });
  });

  group('fatura bloqueada pelo contrato', () {
    testWidgets('sem Pix: bloqueio e botão para o contrato', (tester) async {
      final repo = _FakeCenters(_data());
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1/fatura/i1',
        repo: repo,
      );
      expect(
        find.byKey(const Key('center-invoice-contract-blocked')),
        findsOneWidget,
      );
      expect(
        find.text('Assine o contrato da matrícula para liberar o pagamento'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('center-invoice-pix')), findsNothing);
      expect(find.byKey(const Key('center-invoice-check')), findsNothing);
      expect(repo.calls, isEmpty);
      await _tap(tester, find.byKey(const Key('center-invoice-contract-open')));
      expect(router.state.uri.path, '/treinos/centro/ct1/contrato/k1');
    });

    testWidgets('liberada: Pix de sempre', (tester) async {
      final repo = _FakeCenters(_data(blocked: false));
      await _pump(
        tester,
        location: '/treinos/centro/ct1/fatura/i1',
        repo: repo,
      );
      expect(
        find.byKey(const Key('center-invoice-contract-blocked')),
        findsNothing,
      );
      expect(find.byKey(const Key('center-invoice-pix')), findsOneWidget);
    });
  });
}
