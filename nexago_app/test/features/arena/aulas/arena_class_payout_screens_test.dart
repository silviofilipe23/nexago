import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_teacher.dart';

import 'arena_class_fixtures.dart';
import 'arena_class_payout_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_payout_repository.dart';
import 'fake_arena_class_repository.dart';

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await _settle(tester);
}

FakeArenaClassRepository _classes() => FakeArenaClassRepository(
      classes: [
        arenaClass(id: 'c1', teacherId: 't1', weekdays: const [1, 3])
      ],
    );

/// Outubro/2026 (mês corrente no harness: hoje = 19/10) e setembro fechado.
FakeArenaClassPayoutRepository _payoutRepo({
  List<ArenaClassPayout> payouts = const [],
  ArenaClassTeacherPayoutModel? thiagoModel,
}) {
  final model = thiagoModel ?? revenueShare(50);
  return FakeArenaClassPayoutRepository(
    teachers: [
      teacher(id: 't1', name: 'Thiago Mendes', payout: model),
      teacher(id: 't2', name: 'Juliana Rocha', userId: null),
    ],
    previews: {
      '2026-10': monthPreview('2026-10', [
        previewTeacher(id: 't1', name: 'Thiago Mendes', amount: 480),
        previewTeacher(id: 't2', name: 'Juliana Rocha', amount: 0, model: null),
      ]),
      '2026-09': monthPreview('2026-09', [
        previewTeacher(id: 't1', name: 'Thiago Mendes', amount: 960),
        previewTeacher(id: 't2', name: 'Juliana Rocha', amount: 0, model: null),
        previewTeacher(id: 't3', name: 'Marcos Lima', amount: 450),
      ]),
    },
    payouts: payouts,
  );
}

void main() {
  group('aba Professores', () {
    testWidgets('gestor vê modelo, a pagar do mês e muda o modelo',
        (tester) async {
      final repo = _payoutRepo();
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: repo,
      );
      await _tap(tester, find.text('Professores'));

      expect(find.text('Thiago Mendes'), findsOneWidget);
      expect(find.text('50% da receita'), findsOneWidget);
      expect(find.text('Definir repasse'), findsOneWidget); // Juliana
      expect(find.text('A PAGAR · OUT'), findsNWidgets(2));
      expect(find.text(formatBRL(480)), findsWidgets);
      expect(find.text('REPASSE PREVISTO · OUT'), findsOneWidget);
      expect(repo.previewCalls, [('a1', '2026-10')]);
      expect(repo.teacherReads, everyElement('a1'));

      await _tap(tester, find.text('Definir repasse'));
      expect(find.text('Repasse do professor'), findsOneWidget);
      await _tap(tester, find.text('Valor por aula'));
      await tester.enterText(find.byType(TextField), '45');
      await _tap(tester, find.text('Salvar repasse'));

      final (arenaId, saved, model) = repo.savedModels.single;
      expect(arenaId, 'a1');
      expect(saved.id, 't2');
      expect(model.toPayload(),
          {'model': 'per_class', 'percent': null, 'amountReais': 45.0});
      expect(find.text('Repasse de Juliana Rocha atualizado.'), findsOneWidget);
    });

    testWidgets('recepção vê a agenda dos professores, sem repasse',
        (tester) async {
      final repo = _payoutRepo();
      await pumpAulas(tester, repo: _classes(), payoutRepo: repo);
      await _tap(tester, find.text('Professores'));

      expect(find.text('Thiago Mendes'), findsOneWidget);
      expect(find.textContaining('2 aulas/sem'), findsOneWidget);
      expect(find.text('50% da receita'), findsNothing);
      expect(find.textContaining('A PAGAR'), findsNothing);
      expect(find.text('Repasse do mês'), findsNothing);
      // Nem chama a callable (o servidor recusaria).
      expect(repo.previewCalls, isEmpty);
    });
  });

  group('repasse do mês', () {
    testWidgets('junta prévia e fechados: pago, a pagar e sem modelo',
        (tester) async {
      final repo = _payoutRepo(payouts: [
        payout(
          teacherId: 't1',
          month: '2026-09',
          computed: 960,
          status: 'paid',
          paidOn: '2026-10-05',
          method: ArenaClassPayoutMethod.pix,
        ),
        payout(
          teacherId: 't3',
          name: 'Marcos Lima',
          month: '2026-09',
          computed: 400, // a prévia de hoje dá 450: recalcular
        ),
      ]);
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: repo,
        initial: '/arena/classes/payouts?month=2026-09',
      );

      expect(find.text('setembro de 2026'), findsOneWidget);
      expect(find.text('PAGO 05 OUT'), findsOneWidget);
      expect(find.text('A PAGAR'), findsOneWidget);
      expect(find.text('SEM MODELO'), findsOneWidget);
      expect(find.text('Mudou desde o fechamento — recalcule'), findsOneWidget);
      expect(find.text(formatBRL(1360)), findsOneWidget); // 960 + 400 + 0
      expect(find.textContaining('Mês em andamento'), findsNothing);
      // Fechamentos lidos por query com a arena e o mês.
      expect(repo.monthReads, contains(('a1', '2026-09')));
      expect(repo.previewCalls, contains(('a1', '2026-09')));
    });

    testWidgets('mês corrente é parcial e não avança para o futuro',
        (tester) async {
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: _payoutRepo(),
        initial: '/arena/classes/payouts?month=2027-01',
      );

      expect(find.text('outubro de 2026'), findsOneWidget);
      expect(find.textContaining('Mês em andamento'), findsOneWidget);
      expect(find.text('PARCIAL'), findsOneWidget);

      await _tap(tester, find.bySemanticsLabel('Próximo mês'));
      expect(find.text('outubro de 2026'), findsOneWidget);
      await _tap(tester, find.bySemanticsLabel('Mês anterior'));
      expect(find.text('setembro de 2026'), findsOneWidget);
    });
  });

  group('repasse do professor', () {
    testWidgets('a fechar: ajuste exige motivo e fecha pela callable',
        (tester) async {
      final repo = _payoutRepo();
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: repo,
        initial: '/arena/classes/payouts/t1?month=2026-09',
      );

      expect(find.text('SETEMBRO/2026 · A FECHAR'), findsOneWidget);
      expect(find.text('Iniciante A'), findsOneWidget);
      await _tap(tester, find.text('Fechar mês'));

      expect(find.text('Fechar o repasse'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, '0'), '-40');
      await tester.pump();
      expect(find.text(formatBRL(920)), findsOneWidget); // 960 − 40
      await _tap(tester, find.widgetWithText(FilledButton, 'Fechar mês').last);
      expect(
        find.text('Explique o ajuste (ex.: aula cancelada pelo professor).'),
        findsOneWidget,
      );
      expect(repo.closeCalls, isEmpty);

      await tester.enterText(
        find.widgetWithText(TextField, 'Ex.: aula de 08/10 sem substituto'),
        'Aula de 08/09 sem substituto',
      );
      await _tap(tester, find.widgetWithText(FilledButton, 'Fechar mês').last);

      expect(repo.closeCalls.single, {
        'arenaId': 'a1',
        'teacherId': 't1',
        'month': '2026-09',
        'adjustmentReais': -40.0,
        'adjustmentNote': 'Aula de 08/09 sem substituto',
      });
      expect(find.text('Repasse de setembro fechado.'), findsOneWidget);
    });

    testWidgets('a pagar: registra a forma e a data do pagamento',
        (tester) async {
      final repo = _payoutRepo(payouts: [
        payout(
          teacherId: 't1',
          month: '2026-09',
          computed: 960,
          adjustment: -40,
          note: 'Aula de 08/09 sem substituto',
        ),
      ]);
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: repo,
        initial: '/arena/classes/payouts/t1?month=2026-09',
      );

      expect(find.text('Aula de 08/09 sem substituto'), findsWidgets);
      expect(find.text('− ${formatBRL(40)}'), findsWidgets);
      expect(find.text('Recalcular'), findsOneWidget);
      await _tap(tester, find.text('Registrar pagamento'));
      await _tap(tester, find.text('Transferência'));
      await _tap(tester, find.text('Confirmar pagamento'));

      expect(repo.paidCalls.single,
          ('a1_t1_2026-09', ArenaClassPayoutMethod.transfer, '2026-10-19'));
      expect(
          find.text('Pagamento de Thiago Mendes registrado.'), findsOneWidget);
      // Fechamento e histórico lidos por query (nunca por doc()).
      expect(repo.teacherPayoutReads, contains(('a1', 't1', '2026-09')));
      expect(repo.historyReads, contains(('a1', 't1')));
    });

    testWidgets('pago: desfazer volta para a pagar', (tester) async {
      final repo = _payoutRepo(payouts: [
        payout(
          teacherId: 't1',
          month: '2026-09',
          status: 'paid',
          paidOn: '2026-10-05',
          method: ArenaClassPayoutMethod.cash,
        ),
      ]);
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: repo,
        initial: '/arena/classes/payouts/t1?month=2026-09',
      );

      expect(find.text('Dinheiro · 05 out'), findsOneWidget);
      await _tap(tester, find.text('Desfazer pagamento'));
      expect(find.text('Desfazer o pagamento?'), findsOneWidget);
      await _tap(tester, find.text('Desfazer'));

      expect(repo.undoCalls, ['a1_t1_2026-09']);
    });

    testWidgets('modelo mudou depois do fechamento avisa para recalcular',
        (tester) async {
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: _payoutRepo(
          thiagoModel: perClass(45),
          payouts: [payout(teacherId: 't1', month: '2026-09')],
        ),
        initial: '/arena/classes/payouts/t1?month=2026-09',
      );

      expect(
          find.textContaining('Fechado com o modelo anterior'), findsOneWidget);
    });

    testWidgets('cargo financeiro vê o repasse sem botões e sem o cadastro',
        (tester) async {
      final repo = _payoutRepo(payouts: [
        payout(teacherId: 't1', month: '2026-09'),
      ]);
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.financeiro,
        payoutRepo: repo,
        initial: '/arena/classes/payouts/t1?month=2026-09',
      );

      expect(find.text('Thiago Mendes'), findsOneWidget);
      expect(find.text('Composição do repasse'.toUpperCase()), findsOneWidget);
      expect(find.text('Registrar pagamento'), findsNothing);
      expect(find.text('Recalcular'), findsNothing);
      expect(find.text('Alterar'), findsNothing);
      // `classTeachers` é da agenda: o financeiro não lê.
      expect(repo.teacherReads, isEmpty);
    });

    testWidgets('sem modelo: gestor define pelo detalhe', (tester) async {
      final repo = _payoutRepo();
      await pumpAulas(
        tester,
        repo: _classes(),
        role: ArenaStaffRole.gestor,
        payoutRepo: repo,
        initial: '/arena/classes/payouts/t2?month=2026-09',
      );

      expect(find.text('SETEMBRO/2026 · SEM MODELO'), findsOneWidget);
      await _tap(tester, find.text('Definir modelo de repasse'));
      expect(find.text('Repasse do professor'), findsOneWidget);
      await _tap(tester, find.text('Salvar repasse')); // padrão 50%
      expect(repo.savedModels.single.$3, revenueShare(50));
    });
  });
}
