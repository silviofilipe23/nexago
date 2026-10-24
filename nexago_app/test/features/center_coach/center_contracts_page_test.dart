import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/center_coach/application/center_coach_providers.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/domain/center_contracts.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_contracts_repository.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_student_contracts_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_student_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import 'center_contracts_test.dart' show contractDoc, now;

class _Contracts implements CenterContractsRepository {
  _Contracts(this.list);

  final List<CenterStudentContract> list;
  final reminded = <String>[];
  CenterCoachException? failWith;

  @override
  Stream<List<CenterStudentContract>> watchStudentContracts(
    String centerId,
    String studentId,
  ) =>
      Stream.value(list);

  @override
  Future<int> remind({
    required String centerId,
    required String contractId,
  }) async {
    reminded.add(contractId);
    if (failWith != null) throw failWith!;
    return reminded.length;
  }
}

const _student = CenterCoachStudent(
  id: 's3',
  name: 'Elisa Prado',
  phone: '(21) 99876-4471',
);

Future<void> _pump(
  WidgetTester tester, {
  required _Contracts repo,
  String role = 'receptionist',
  List<Uri>? launched,
}) async {
  tester.view.physicalSize = const Size(420, 1800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: '/athlete/professor/centros/c1/alunos/s3/contratos',
    routes: [
      GoRoute(
        path: AppRoutes.centerCoachStudentContracts,
        name: AppRouteNames.centerCoachStudentContracts,
        builder: (_, s) => CenterCoachStudentContractsPage(
          centerId: s.pathParameters['centerId']!,
          studentId: s.pathParameters['studentId']!,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('tm'),
        professorLinksClockProvider.overrideWithValue(() => now),
        myCenterMembershipsProvider.overrideWith(
          (ref) => Stream.value([
            CenterMembership(
              centerId: 'c1',
              centerName: 'CT Maré Alta',
              role: role,
              status: 'active',
            ),
          ]),
        ),
        coachStudentsProvider.overrideWith(
          (ref, centerId) => Stream.value({_student.id: _student}),
        ),
        centerContractsRepositoryProvider.overrideWithValue(repo),
        centerContactLauncherProvider.overrideWithValue((uri) async {
          launched?.add(uri);
          return true;
        }),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await _settle(tester);
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

  final contracts = [
    CenterStudentContract.fromMap('v3', contractDoc()),
    CenterStudentContract.fromMap(
      'img',
      contractDoc(
        status: 'signed',
        kind: 'term',
        requireBeforePayment: false,
        endDate: null,
        templateName: 'Termo de uso de imagem',
        templateVersion: 1,
        signedAt: DateTime.utc(2026, 10, 20, 15),
      ),
    ),
    CenterStudentContract.fromMap(
      'v2',
      contractDoc(
        status: 'terminated',
        templateVersion: 2,
        sentAt: DateTime.utc(2025, 10, 20),
        terminatedAt: DateTime.utc(2026, 10, 19, 15),
        terminateReason: 'substituído pela v3',
      ),
    ),
  ];

  testWidgets('card do pendente, documentos e histórico', (tester) async {
    await _pump(tester, repo: _Contracts(contracts));
    expect(find.byKey(const Key('center-contracts-pending')), findsOneWidget);
    expect(find.text('4 DIAS'), findsOneWidget);
    expect(
      find.text(
        'Elisa abriu o contrato 3 vezes e não assinou. O pagamento da '
        'matrícula só é liberado depois da assinatura.',
      ),
      findsOneWidget,
    );
    expect(find.text('ELISA PRADO · BT INTERMEDIÁRIO B'), findsOneWidget);
    expect(find.text('Aberto 3× · último ontem 21:14'), findsOneWidget);
    expect(find.text('Assinado 20 out'), findsOneWidget);
    expect(find.text('HISTÓRICO'), findsOneWidget);
    expect(find.text('Encerrado 19 out · substituído pela v3'), findsOneWidget);
    expect(find.byKey(const Key('center-contracts-remind')), findsOneWidget);
  });

  testWidgets('reenviar lembrete: sucesso e erro da callable', (tester) async {
    final repo = _Contracts(contracts);
    await _pump(tester, repo: repo);
    await _tap(tester, find.byKey(const Key('center-contracts-remind')));
    expect(repo.reminded, ['v3']);
    expect(find.text('Lembrete enviado para o app do aluno.'), findsOneWidget);

    repo.failWith = const CenterCoachException(
      'Um lembrete já saiu na última hora. Tente mais tarde.',
    );
    await _tap(tester, find.byKey(const Key('center-contracts-remind')));
    expect(
      find.text('Um lembrete já saiu na última hora. Tente mais tarde.'),
      findsOneWidget,
    );
  });

  testWidgets('WhatsApp do aluno e Ver documento', (tester) async {
    final launched = <Uri>[];
    await _pump(tester, repo: _Contracts(contracts), launched: launched);
    await _tap(tester, find.byKey(const Key('center-contracts-whatsapp')));
    expect(launched.single.host, 'wa.me');
    expect(launched.single.path, '/5521998764471');

    await _tap(tester, find.byKey(const Key('center-contracts-view')));
    expect(find.byKey(const Key('center-contract-document')), findsOneWidget);
    expect(find.text('1. Partes'), findsOneWidget);
    expect(find.text('Enviado pelo app'), findsOneWidget);
  });

  testWidgets('sem nada enviado: aviso e sem rodapé', (tester) async {
    await _pump(tester, repo: _Contracts(const []));
    expect(find.byKey(const Key('center-contracts-empty')), findsOneWidget);
    expect(find.byKey(const Key('center-contracts-remind')), findsNothing);
  });

  testWidgets('professor sem matrícula não vê', (tester) async {
    await _pump(tester, repo: _Contracts(contracts), role: 'coach');
    expect(find.byKey(const Key('center-contracts-no-access')), findsOneWidget);
    expect(find.byKey(const Key('center-contracts-pending')), findsNothing);
  });
}
