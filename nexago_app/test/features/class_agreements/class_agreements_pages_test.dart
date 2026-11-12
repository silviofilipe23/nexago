import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/class_agreements/application/class_agreements_providers.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';
import 'package:nexago_app/features/class_agreements/infrastructure/class_agreements_repository.dart';
import 'package:nexago_app/features/class_agreements/presentation/widgets/class_agreements_entry_points.dart';

import 'class_agreements_test_support.dart';

Finder _key(String k) => find.byKey(Key(k));

ClassAgreement _signedFrom(ClassAgreement a) => ClassAgreement.fromMap({
      ...agreementJson(
        id: a.agreementId,
        audience: a.audience,
        status: 'signed',
        arenaName: a.arenaName,
        body: a.body,
        signedAt: '2026-11-12T15:00:00Z',
      ),
    });

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
    await loadClassAgreementFonts();
  });

  group('contrato de professor pendente', () {
    testWidgets(
        'travado até ler o fim → folha com checkbox → assina → '
        '"Contrato assinado"', (tester) async {
      final pending = agreement(
        id: 'ag-prof-1',
        audience: 'professor',
        status: 'pending',
        body: longContractBody,
        signedAt: null,
        evidence: false,
      );
      final repo = FakeClassAgreementsRepository(
        agreements: {'ag-prof-1': pending},
      )..afterSign = _signedFrom;
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/ag-prof-1',
        repo: repo,
      );

      expect(find.text('Contrato de professor'), findsWidgets);
      expect(find.text('Leia até o fim para assinar'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-agreement-sign'), isFalse);
      expect(_key('class-agreement-receipt'), findsNothing);

      await tester.drag(
          _key('class-agreement-scroll'), const Offset(0, -30000));
      await settle(tester);
      expect(buttonEnabled(tester, 'class-agreement-sign'), isTrue);

      await tapKey(tester, 'class-agreement-sign');
      expect(find.text('Contrato de professor · Arena Sul'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-agreement-confirm'), isFalse);
      await tapKey(tester, 'class-agreement-agree');
      expect(buttonEnabled(tester, 'class-agreement-confirm'), isTrue);
      await tapKey(tester, 'class-agreement-confirm');

      expect(repo.lastSign, {
        'agreementId': 'ag-prof-1',
        'sha256': sha,
        'readSeconds': isA<int>(),
        'platform': 'ios',
        'appVersion': '1.0.21+119',
      });
      expect(_key('class-agreement-signed-now'), findsOneWidget);
      expect(find.text('Contrato assinado'), findsOneWidget);
      expect(find.text('Pronto para receber alunos'), findsOneWidget);
      expect(_key('class-agreement-sign'), findsNothing);
      // Releu o contrato depois de assinar.
      expect(repo.calls.where((c) => c == 'agreement ag-prof-1'), hasLength(2));
    });

    testWidgets('contrato curto que cabe na tela já libera', (tester) async {
      final repo = FakeClassAgreementsRepository(agreements: {
        'ag-prof-1': agreement(
          id: 'ag-prof-1',
          audience: 'professor',
          status: 'pending',
          signedAt: null,
          evidence: false,
        ),
      });
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/ag-prof-1',
        repo: repo,
        size: const Size(400, 2400),
      );
      expect(buttonEnabled(tester, 'class-agreement-sign'), isTrue);
    });

    testWidgets('erro ao assinar: avisa e o botão continua lá', (tester) async {
      final repo = FakeClassAgreementsRepository(agreements: {
        'ag-prof-1': agreement(
          id: 'ag-prof-1',
          audience: 'professor',
          status: 'pending',
          signedAt: null,
          evidence: false,
        ),
      })
        ..signError = ClassAgreementException(
          'A arena cancelou este contrato.',
          code: 'failed-precondition',
        );
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/ag-prof-1',
        repo: repo,
        size: const Size(400, 2400),
      );
      await tapKey(tester, 'class-agreement-sign');
      await tapKey(tester, 'class-agreement-agree');
      await tapKey(tester, 'class-agreement-confirm');

      expect(find.textContaining('A arena cancelou este contrato.'),
          findsOneWidget);
      expect(_key('class-agreement-signed-now'), findsNothing);
      expect(_key('class-agreement-sign'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-agreement-sign'), isTrue);
    });

    testWidgets('fechar a folha sem marcar não chama o servidor',
        (tester) async {
      final repo = FakeClassAgreementsRepository(agreements: {
        'ag-prof-1': agreement(
          id: 'ag-prof-1',
          audience: 'professor',
          status: 'pending',
          signedAt: null,
          evidence: false,
        ),
      });
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/ag-prof-1',
        repo: repo,
        size: const Size(400, 2400),
      );
      await tapKey(tester, 'class-agreement-sign');
      await tester.tapAt(const Offset(200, 20));
      await settle(tester);
      expect(_key('class-agreement-agree'), findsNothing);
      expect(repo.lastSign, isNull);
    });
  });

  group('contrato de aluno assinado', () {
    testWidgets('mostra o comprovante e não mostra botão de assinar',
        (tester) async {
      final repo = FakeClassAgreementsRepository(
        agreements: {'ag1': agreement()},
      );
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/ag1',
        repo: repo,
        size: const Size(400, 2400),
      );

      expect(_key('class-agreement-sign'), findsNothing);
      expect(find.text('Leia até o fim para assinar'), findsNothing);
      expect(find.text('Vigente até 15/11/2027'), findsOneWidget);

      final receipt = _key('class-agreement-receipt');
      await tester.ensureVisible(receipt);
      await tester.pump();
      expect(receipt, findsOneWidget);
      Finder inReceipt(String text) =>
          find.descendant(of: receipt, matching: find.text(text));
      expect(inReceipt('Carla Souza'), findsOneWidget);
      // 14:30 UTC = 11:30 em São Paulo.
      expect(inReceipt('10/11/2026 11:30'), findsOneWidget);
      expect(inReceipt('iPhone · app 1.0.21+119'), findsOneWidget);
      expect(inReceipt('189.6.***.***'), findsOneWidget);
      expect(inReceipt('9f3a…c27e'), findsOneWidget);
      expect(repo.calls.where((c) => c.startsWith('sign')), isEmpty);
    });

    testWidgets('assinado sem evidência não mostra comprovante',
        (tester) async {
      final repo = FakeClassAgreementsRepository(
        agreements: {'ag1': agreement(evidence: false)},
      );
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/ag1',
        repo: repo,
        size: const Size(400, 2400),
      );
      expect(_key('class-agreement-receipt'), findsNothing);
      expect(_key('class-agreement-sign'), findsNothing);
    });

    testWidgets('contrato que não existe mostra o erro', (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas/nao-existe',
        repo: repo,
      );
      expect(
          find.text('Não foi possível abrir este contrato.'), findsOneWidget);
      expect(_key('class-agreement-sign'), findsNothing);
    });
  });

  group('lista de contratos', () {
    testWidgets('pendente do professor no topo; vigentes agrupados por arena',
        (tester) async {
      final repo = FakeClassAgreementsRepository(mine: [
        agreement(id: 'a1'),
        agreement(
          id: 'p1',
          audience: 'professor',
          status: 'pending',
          arenaId: 'arena-norte',
          arenaName: 'Arena Norte',
          signedAt: null,
        ),
        agreement(id: 'a2'),
        agreement(
          id: 'b1',
          arenaId: 'arena-norte',
          arenaName: 'Arena Norte',
        ),
        agreement(id: 'x1', status: 'canceled'),
      ]);
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas',
        repo: repo,
        size: const Size(400, 2400),
      );

      expect(_key('class-agreements-list'), findsOneWidget);
      expect(find.text('Vigentes · 4'), findsOneWidget);
      expect(find.text('Encerrados · 1'), findsOneWidget);
      expect(find.text('ESPERANDO SUA ASSINATURA'), findsOneWidget);
      expect(find.text('ARENA SUL · 2 CONTRATOS'), findsOneWidget);
      expect(find.text('ARENA NORTE'), findsOneWidget);
      expect(find.text('Enviado por Arena Norte'), findsOneWidget);
      expect(_key('class-agreement-x1'), findsNothing);

      final y = {
        for (final id in ['p1', 'a1', 'a2', 'b1'])
          id: tester.getTopLeft(_key('class-agreement-$id')).dy,
      };
      expect(y['p1']! < y['a1']!, isTrue, reason: 'pendente antes');
      expect(y['a1']! < y['a2']!, isTrue);
      expect(y['a2']! < y['b1']!, isTrue, reason: 'agrupado por arena');

      await tapKey(tester, 'class-agreements-past');
      expect(_key('class-agreement-x1'), findsOneWidget);
      expect(_key('class-agreement-a1'), findsNothing);
    });

    testWidgets('tocar no card abre o contrato', (tester) async {
      final repo = FakeClassAgreementsRepository(
        mine: [agreement()],
        agreements: {'ag1': agreement()},
      );
      final router = await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas',
        repo: repo,
      );
      await tapKey(tester, 'class-agreement-ag1');
      expect(router.state.uri.path, '/contratos-aulas/ag1');
      expect(_key('class-agreement-scroll'), findsOneWidget);
    });

    testWidgets('sem contratos mostra o vazio', (tester) async {
      await pumpClassAgreementsApp(
        tester,
        location: '/contratos-aulas',
        repo: FakeClassAgreementsRepository(),
      );
      expect(find.text('Nenhum contrato vigente'), findsOneWidget);
    });
  });

  group('providers', () {
    test('deslogado: myClassAgreementsProvider não chama a callable', () async {
      final repo = FakeClassAgreementsRepository(mine: [agreement()]);
      final container = ProviderContainer(overrides: [
        classAgreementsRepositoryProvider.overrideWithValue(repo),
        classAgreementsUidProvider.overrideWithValue(''),
      ]);
      addTearDown(container.dispose);
      final sub = container.listen(myClassAgreementsProvider, (_, __) {});
      addTearDown(sub.close);
      expect(await container.read(myClassAgreementsProvider.future), isEmpty);
      expect(repo.calls, isEmpty);
    });

    test('pendentes do professor: só professor + pendente; erro vira vazio',
        () async {
      final repo = FakeClassAgreementsRepository(mine: [
        agreement(id: 'a1'),
        agreement(id: 'p1', audience: 'professor', status: 'pending'),
        agreement(id: 'p2', audience: 'professor', status: 'signed'),
        agreement(id: 's1', status: 'pending'),
      ]);
      final container = ProviderContainer(overrides: [
        classAgreementsRepositoryProvider.overrideWithValue(repo),
        classAgreementsUidProvider.overrideWithValue('me'),
      ]);
      addTearDown(container.dispose);
      final sub =
          container.listen(pendingProfessorAgreementsProvider, (_, __) {});
      addTearDown(sub.close);
      final list =
          await container.read(pendingProfessorAgreementsProvider.future);
      expect(list.map((a) => a.agreementId), ['p1']);
    });

    test('pendentes do professor: falha da callable não quebra', () async {
      final repo = FakeClassAgreementsRepository()
        ..myAgreementsError = ClassAgreementException('fora do ar');
      final container = ProviderContainer(overrides: [
        classAgreementsRepositoryProvider.overrideWithValue(repo),
        classAgreementsUidProvider.overrideWithValue('me'),
      ]);
      addTearDown(container.dispose);
      final sub =
          container.listen(pendingProfessorAgreementsProvider, (_, __) {});
      addTearDown(sub.close);
      expect(
        await container.read(pendingProfessorAgreementsProvider.future),
        isEmpty,
      );
    });

    test('arenaClassSignupOpenProvider: arenaId vazio é falso sem ler',
        () async {
      final repo = FakeClassAgreementsRepository();
      final container = ProviderContainer(overrides: [
        classAgreementsRepositoryProvider.overrideWithValue(repo),
      ]);
      addTearDown(container.dispose);
      final sub =
          container.listen(arenaClassSignupOpenProvider(''), (_, __) {});
      addTearDown(sub.close);
      expect(await container.read(arenaClassSignupOpenProvider('').future),
          isFalse);
      expect(repo.calls, isEmpty);
    });
  });

  group('pontos de entrada', () {
    Future<GoRouter> pumpEntry(
      WidgetTester tester,
      Widget child,
      FakeClassAgreementsRepository repo,
    ) async {
      tester.view.physicalSize = const Size(400, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => Scaffold(body: ListView(children: [child])),
          ),
          GoRoute(
            path: AppRoutes.classPlanSignup,
            builder: (_, s) =>
                Scaffold(body: Text('signup ${s.pathParameters['arenaId']}')),
          ),
          GoRoute(
            path: AppRoutes.classAgreement,
            name: AppRouteNames.classAgreement,
            builder: (_, s) => Scaffold(
                body: Text('contrato ${s.pathParameters['agreementId']}')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          classAgreementsRepositoryProvider.overrideWithValue(repo),
          classAgreementsUidProvider.overrideWithValue('me'),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ));
      await settle(tester);
      return router;
    }

    testWidgets('perfil da arena: "Planos de aula" só com classSignupOpen',
        (tester) async {
      final repo = FakeClassAgreementsRepository()..signupOpen = false;
      await pumpEntry(
        tester,
        const ArenaDetailClassPlansSection(arenaId: 'arena-sul'),
        repo,
      );
      expect(_key('arena-detail-class-plans'), findsNothing);
      expect(find.text('Planos de aula'), findsNothing);
    });

    testWidgets('perfil da arena aberto: card leva à contratação',
        (tester) async {
      final repo = FakeClassAgreementsRepository()..signupOpen = true;
      final router = await pumpEntry(
        tester,
        const ArenaDetailClassPlansSection(arenaId: 'arena-sul'),
        repo,
      );
      expect(find.text('Planos de aula'), findsOneWidget);
      await tapKey(tester, 'arena-detail-class-plans');
      expect(router.state.uri.path, '/aulas/contratar/arena-sul');
    });

    testWidgets('Modo Professor: card do contrato pendente abre o contrato',
        (tester) async {
      final repo = FakeClassAgreementsRepository(mine: [
        agreement(id: 'a1'),
        agreement(
          id: 'p1',
          audience: 'professor',
          status: 'pending',
          arenaName: 'Arena Norte',
        ),
      ]);
      final router = await pumpEntry(
        tester,
        const ProfessorPendingAgreementsCard(),
        repo,
      );
      expect(_key('professor-agreement-pending-p1'), findsOneWidget);
      expect(_key('professor-agreement-pending-a1'), findsNothing);
      expect(find.text('Arena Norte'), findsOneWidget);
      await tapKey(tester, 'professor-agreement-pending-p1');
      expect(router.state.uri.path, '/contratos-aulas/p1');
    });

    testWidgets('Modo Professor: sem pendente o card some', (tester) async {
      final repo = FakeClassAgreementsRepository(mine: [agreement()]);
      await pumpEntry(tester, const ProfessorPendingAgreementsCard(), repo);
      expect(find.textContaining('Enviou seu contrato'), findsNothing);
    });
  });
}
