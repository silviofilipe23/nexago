import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena_contract/application/arena_contract_providers.dart';
import 'package:nexago_app/features/arena_contract/domain/arena_contract.dart';
import 'package:nexago_app/features/arena_contract/presentation/my_arena_contract_page.dart';
import 'package:nexago_app/features/schedule_plans/presentation/widgets/schedule_plan_ui.dart';

import 'arena_contract_fixtures.dart';

// Tela Meu contrato: em dia, em atraso (com e sem link), dois contratos,
// contrato pedido pelo push, vazio e erro.

const _launcher = MethodChannel('plugins.flutter.io/url_launcher');

Future<void> _pump(
  WidgetTester tester,
  List<Map<String, dynamic>> contracts, {
  String? contractId,
  Object? error,
}) async {
  // Alto o bastante para a lista inteira ficar montada.
  tester.view.physicalSize = const Size(1170, 7200);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: '/c',
    routes: [
      GoRoute(
        path: '/c',
        builder: (_, __) => MyArenaContractPage(contractId: contractId),
      ),
      GoRoute(
        path: AppRoutes.athleteBilling,
        builder: (_, __) => const Text('COBRANCAS'),
      ),
      GoRoute(
        path: AppRoutes.arenaDetail,
        name: AppRouteNames.arenaDetail,
        builder: (_, state) => Text('ARENA ${state.pathParameters['arenaId']}'),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        myArenaContractsProvider.overrideWith((ref) async {
          if (error != null) throw error;
          return MyArenaContracts.fromMap({
            'today': '2026-11-11',
            'contracts': contracts,
          });
        }),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
  // Esgota a entrada animada (FadeSlideIn) do esqueleto de carregamento.
  await tester.pump(const Duration(milliseconds: 600));
}

/// Abre o url_launcher de mentira e devolve o que foi aberto.
List<String> _captureLaunches(WidgetTester tester) {
  final launched = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    _launcher,
    (call) async {
      if (call.method == 'launch') {
        launched.add((call.arguments as Map)['url'] as String);
      }
      return true;
    },
  );
  addTearDown(() => tester.binding.defaultBinaryMessenger
      .setMockMethodCallHandler(_launcher, null));
  return launched;
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

String _statusText(WidgetTester tester) {
  final status = find.byKey(const Key('arena-contract-status'));
  return tester
      .widget<Text>(find.descendant(of: status, matching: find.byType(Text)))
      .data!;
}

void main() {
  testWidgets('em dia: próxima mensalidade, sem dívida e sem Pagar',
      (tester) async {
    await _pump(tester, [
      contractMap(weekHours: const [2, 3, 1.5])
    ]);

    expect(find.text('Meu contrato'), findsOneWidget);
    expect(_statusText(tester), 'EM DIA');
    expect(find.text('Mensalista 3h'), findsOneWidget);
    expect(find.text('${scheduleMoney(300)}/mês · vence todo dia 15'),
        findsOneWidget);
    expect(find.text('Renova sozinho'), findsOneWidget);
    expect(find.text('3h por semana'), findsOneWidget);

    expect(find.byKey(const Key('arena-contract-debt')), findsNothing);
    final next = find.byKey(const Key('arena-contract-next'));
    expect(next, findsOneWidget);
    expect(
      find.descendant(of: next, matching: find.text('Próxima mensalidade')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: next, matching: find.text('15/11 · 3ª parcela')),
      findsOneWidget,
    );
    // 15/11/2026 é domingo.
    expect(
        find.descendant(of: next, matching: find.text('DOM')), findsOneWidget);
    expect(find.byKey(const Key('arena-contract-pay')), findsNothing);

    // Sem tabs com um contrato só.
    expect(find.byKey(const Key('arena-contract-tab-c1')), findsNothing);

    // Banco de horas: 1h30 de 3h.
    final hours = find.byKey(const Key('arena-contract-hours'));
    expect(hours, findsOneWidget);
    expect(
      find.descendant(
        of: hours,
        matching:
            find.textContaining('de 3h · sobram 1h30', findRichText: true),
      ),
      findsOneWidget,
    );
    final bar = tester.widget<LinearProgressIndicator>(
      find.descendant(
          of: hours, matching: find.byType(LinearProgressIndicator)),
    );
    expect(bar.value, 0.5);

    // Parcelas.
    for (final n in [1, 2, 3, 4]) {
      expect(find.byKey(ValueKey('arena-contract-installment-$n')),
          findsOneWidget);
    }
    expect(find.text('2 PAGAS'), findsOneWidget);
    expect(find.text('VENCE 15'), findsOneWidget);
    expect(find.text('FUTURA'), findsOneWidget);
  });

  testWidgets('em dia com link aberto: Pagar com o valor do link no card',
      (tester) async {
    final launched = _captureLaunches(tester);
    await _pump(tester, [contractMap(payLink: payLinkMap)]);

    expect(find.byKey(const Key('arena-contract-debt')), findsNothing);
    final pay = find.byKey(const Key('arena-contract-pay'));
    expect(
      find.descendant(
        of: find.byKey(const Key('arena-contract-next')),
        matching: pay,
      ),
      findsOneWidget,
    );
    expect(find.text('Pagar ${scheduleMoney(612.5)} · Pix ou cartão'),
        findsOneWidget);

    await _tap(tester, pay);
    expect(launched, ['https://www.asaas.com/i/crm1']);
  });

  testWidgets('em atraso com link: dívida e Pagar com o valor do link',
      (tester) async {
    final launched = _captureLaunches(tester);
    await _pump(tester, [overdueContractMap(payLink: payLinkMap)]);

    expect(_statusText(tester), '2 EM ATRASO');
    final debt = find.byKey(const Key('arena-contract-debt'));
    expect(debt, findsOneWidget);
    expect(find.byKey(const Key('arena-contract-next')), findsNothing);
    expect(
      find.descendant(
        of: debt,
        matching: find.textContaining(scheduleMoney(600), findRichText: true),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: debt,
        matching: find.textContaining('2 mensalidades', findRichText: true),
      ),
      findsOneWidget,
    );
    expect(find.textContaining('15/09'), findsWidgets);

    final pay = find.byKey(const Key('arena-contract-pay'));
    expect(find.descendant(of: debt, matching: pay), findsOneWidget);
    expect(find.text('Pagar ${scheduleMoney(612.5)} · Pix ou cartão'),
        findsOneWidget);
    expect(find.textContaining('Pague na arena'), findsNothing);
    expect(find.text('A PAGAR'), findsNWidgets(2));

    await _tap(tester, pay);
    expect(launched, ['https://www.asaas.com/i/crm1']);
  });

  testWidgets('em atraso sem link: sem Pagar, "Pague na arena"',
      (tester) async {
    await _pump(tester, [overdueContractMap()]);

    expect(find.byKey(const Key('arena-contract-debt')), findsOneWidget);
    expect(find.byKey(const Key('arena-contract-pay')), findsNothing);
    expect(find.textContaining('Pague na arena'), findsOneWidget);
    expect(find.text('ATRASADA'), findsNWidgets(2));
  });

  testWidgets('WhatsApp leva a mensagem com o valor em aberto', (tester) async {
    final launched = _captureLaunches(tester);
    await _pump(tester, [overdueContractMap()]);

    await _tap(tester, find.byKey(const Key('arena-contract-whatsapp')));

    final url = Uri.parse(launched.single);
    expect(url.host, 'wa.me');
    expect(url.path, '/5562999990000');
    expect(url.queryParameters['text'], contains(scheduleMoney(600)));
    expect(url.queryParameters['text'], contains('Mensalista 3h'));
  });

  testWidgets('arena sem WhatsApp: sem o botão', (tester) async {
    await _pump(tester, [overdueContractMap(arenaWhatsapp: null)]);
    expect(find.byKey(const Key('arena-contract-whatsapp')), findsNothing);
  });

  testWidgets('Reservar horário abre a arena do contrato', (tester) async {
    await _pump(tester, [contractMap(arenaId: 'arena-xyz')]);

    await _tap(tester, find.byKey(const Key('arena-contract-book')));
    await tester.pumpAndSettle();

    expect(find.text('ARENA arena-xyz'), findsOneWidget);
  });

  testWidgets('pagamentos listados', (tester) async {
    await _pump(tester, [
      contractMap(payments: [
        {
          'paidOn': '2026-10-14',
          'amountReais': 300,
          'installments': 1,
          'method': 'Pix online',
        },
        {
          'paidOn': '2026-09-15',
          'amountReais': 600,
          'installments': 2,
          'method': 'Dinheiro',
        },
      ]),
    ]);

    expect(find.text('14/10 · ${scheduleMoney(300)}'), findsOneWidget);
    expect(find.text('Pix online · 1 parcela'), findsOneWidget);
    expect(find.text('Dinheiro · 2 parcelas'), findsOneWidget);
  });

  testWidgets('dois contratos: chips e troca de contrato', (tester) async {
    await _pump(tester, [
      overdueContractMap(id: 'c1'),
      contractMap(
        id: 'c2',
        arenaName: 'Arena Sul',
        planName: 'Mensalista 2h',
        weeklyHours: 2,
      ),
    ]);

    final tab1 = find.byKey(const ValueKey('arena-contract-tab-c1'));
    final tab2 = find.byKey(const ValueKey('arena-contract-tab-c2'));
    expect(tab1, findsOneWidget);
    expect(tab2, findsOneWidget);
    expect(tester.widget<ChoiceChip>(tab1).selected, isTrue);
    expect(tester.widget<ChoiceChip>(tab2).selected, isFalse);
    expect(find.text('Arena Sul · Mensalista 2h'), findsOneWidget);
    expect(find.byKey(const Key('arena-contract-debt')), findsOneWidget);

    await _tap(tester, tab2);

    expect(tester.widget<ChoiceChip>(tab1).selected, isFalse);
    expect(tester.widget<ChoiceChip>(tab2).selected, isTrue);
    expect(find.text('Mensalista 2h'), findsOneWidget);
    expect(_statusText(tester), 'EM DIA');
    expect(find.byKey(const Key('arena-contract-debt')), findsNothing);
    expect(find.byKey(const Key('arena-contract-next')), findsOneWidget);
  });

  testWidgets('contractId do push escolhe o contrato', (tester) async {
    await _pump(
      tester,
      [
        overdueContractMap(id: 'c1'),
        contractMap(id: 'c2', planName: 'Mensalista 2h'),
      ],
      contractId: 'c2',
    );

    expect(
      tester
          .widget<ChoiceChip>(
              find.byKey(const ValueKey('arena-contract-tab-c2')))
          .selected,
      isTrue,
    );
    expect(find.text('Mensalista 2h'), findsOneWidget);
    expect(find.byKey(const Key('arena-contract-debt')), findsNothing);
  });

  testWidgets('contractId que não existe mais: abre o primeiro',
      (tester) async {
    await _pump(
      tester,
      [overdueContractMap(id: 'c1'), contractMap(id: 'c2')],
      contractId: 'sumiu',
    );

    expect(
      tester
          .widget<ChoiceChip>(
              find.byKey(const ValueKey('arena-contract-tab-c1')))
          .selected,
      isTrue,
    );
    expect(find.byKey(const Key('arena-contract-debt')), findsOneWidget);
  });

  testWidgets('lista vazia: "Nenhum contrato de mensalista"', (tester) async {
    await _pump(tester, const []);

    expect(find.text('Nenhum contrato de mensalista'), findsOneWidget);
    expect(find.byKey(const Key('arena-contract-status')), findsNothing);
    expect(find.byKey(const Key('arena-contract-hours')), findsNothing);
  });

  testWidgets('erro da callable: mensagem amigável', (tester) async {
    await _pump(tester, const [], error: Exception('internal'));

    expect(
      find.text('Não foi possível carregar o seu contrato. Tente novamente.'),
      findsOneWidget,
    );
    expect(find.textContaining('internal'), findsNothing);
  });

  testWidgets('voltar sem pilha leva às Cobranças', (tester) async {
    await _pump(tester, [contractMap()]);

    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();

    expect(find.text('COBRANCAS'), findsOneWidget);
  });
}
