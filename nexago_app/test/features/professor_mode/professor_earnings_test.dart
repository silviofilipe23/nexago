import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/arena/domain/payout_pix_key_type.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_earnings.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts, professorLink;
import 'professor_earnings_test_support.dart';
import 'professor_students_test_support.dart';

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

String text(WidgetTester tester, String key) =>
    tester.widget<Text>(find.byKey(Key(key))).data!;

const _key = ProfessorPayoutPixKey(pixKey: '52998224725', pixKeyType: 'CPF');

FakeProfessorEarningsRepository repo({
  double available = 860,
  double pending = 0,
  List<ProfessorWithdrawal>? withdrawals,
  ProfessorPayoutPixKey? key = _key,
  ProfessorWithdrawalResult? result,
}) =>
    FakeProfessorEarningsRepository(
      wallet: ProfessorEarningsWallet(
        availableReais: available,
        pendingReais: pending,
        exists: true,
      ),
      ledger: [
        ProfessorEarningsEntry(
          id: 'l1',
          arenaName: 'Arena CFC',
          month: '2026-09',
          amountReais: 860,
          createdAt: DateTime(2026, 10, 5),
        ),
      ],
      pending: const [
        ProfessorPendingPayout(
          payoutId: 'p1',
          arenaName: 'Arena CFC',
          month: '2026-10',
          amountReais: 1680,
        ),
      ],
      withdrawals: withdrawals ?? [withdrawal()],
      pixKey: key,
      result: result,
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('lógica', () {
    test('situação do saque', () {
      expect(withdrawal().standing, ProfessorWithdrawalStanding.done);
      expect(withdrawal(payoutStatus: 'sent').standing,
          ProfessorWithdrawalStanding.sending);
      expect(
        withdrawal(
                status: 'pending',
                payoutStatus: 'pending',
                mode: 'manual_review')
            .standing,
        ProfessorWithdrawalStanding.awaitingApproval,
      );
      expect(withdrawal(status: 'rejected', payoutStatus: 'failed').standing,
          ProfessorWithdrawalStanding.failed);
      expect(withdrawal(status: 'pending', payoutStatus: 'failed').standing,
          ProfessorWithdrawalStanding.review);
      expect(withdrawal(payoutStatus: 'manual').standing,
          ProfessorWithdrawalStanding.manual);
      expect(withdrawal(status: 'pending').inProgress, isTrue);
    });

    test('valor, prazo, chave e leitura', () {
      expect(
          validateProfessorWithdrawal(null, 100), 'Saque mínimo de R\$ 1,00.');
      expect(validateProfessorWithdrawal(200, 100),
          'Saldo insuficiente para este saque.');
      expect(validateProfessorWithdrawal(100, 100), isNull);
      expect(professorWithdrawalDeadline(500), 'Na hora');
      expect(professorWithdrawalDeadline(500.01), 'Após aprovação');
      expect(professorMaskedPixKey('52998224725', PayoutPixKeyType.cpf),
          'CPF ···.982.247-··');
      expect(professorMaskedPixKey('maria@gmail.com', PayoutPixKeyType.email),
          'E-mail ma···@gmail.com');
      expect(professorEarningsMonthLabel('2026-10'), 'Outubro/2026');
      final w = ProfessorEarningsWallet.fromMap(
          const {'availableReais': 10.5, 'pendingReais': 2});
      expect(w.availableReais, 10.5);
      expect(w.exists, isTrue);
      expect(
          ProfessorPayoutPixKey.fromMap(const {'payoutPixKey': ' '}), isNull);
      final entry = ProfessorEarningsEntry.fromMap('e', {
        'type': 'repasse',
        'arenaName': 'Arena',
        'month': '2026-09',
        'amountReais': 100,
        'createdAt': Timestamp.fromDate(DateTime(2026, 10, 5)),
      });
      expect(entry.createdAt, DateTime(2026, 10, 5));
      final r = ProfessorWithdrawalResult.fromMap(const {
        'withdrawalId': 'w',
        'status': 'pending',
        'payoutStatus': 'pending',
        'autoProcessed': false,
        'message': 'Aguardando aprovação.',
      });
      expect(r.sent, isFalse);
      expect(r.message, 'Aguardando aprovação.');
    });
  });

  group('C1 Ganhos', () {
    testWidgets('saldo, em liberação, de onde veio e saques', (tester) async {
      await pumpProfessorEarningsApp(
        tester,
        earnings: repo(pending: 120),
        links: [professorLink()],
        location: AppRoutes.professorEarnings,
      );
      expect(text(tester, 'professor-earnings-available'), contains('860,00'));
      expect(
          text(tester, 'professor-earnings-in-withdrawal'), contains('120,00'));
      expect(
          text(tester, 'professor-earnings-releasing'), contains('1.680,00'));
      expect(find.byKey(const Key('professor-earnings-pending-p1')),
          findsOneWidget);
      expect(
          find.byKey(const Key('professor-earnings-entry-l1')), findsOneWidget);
      expect(find.text('CONCLUÍDO'), findsOneWidget);
    });

    testWidgets('saque em andamento trava o Sacar', (tester) async {
      await pumpProfessorEarningsApp(
        tester,
        earnings: repo(withdrawals: [
          withdrawal(status: 'pending', payoutStatus: 'pending')
        ]),
        links: [professorLink()],
        location: AppRoutes.professorEarnings,
      );
      expect(find.text('Saque em andamento'), findsOneWidget);
    });

    testWidgets('independente sem equipe: explica e leva à conta Asaas',
        (tester) async {
      await pumpProfessorEarningsApp(
        tester,
        earnings: FakeProfessorEarningsRepository(),
        links: [
          professorLink(type: ArenaProfessorLinkType.independent),
        ],
        location: AppRoutes.professorEarnings,
      );
      expect(find.byKey(const Key('professor-earnings-independent')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-earnings-go-payout')),
          findsOneWidget);
    });
  });

  group('C2–C6 Saque', () {
    testWidgets('Tudo → revisar → confirmar → enviado', (tester) async {
      final r = repo();
      await pumpProfessorEarningsApp(
        tester,
        earnings: r,
        links: [professorLink()],
        location: AppRoutes.professorWithdraw,
      );
      expect(find.text('CPF ···.982.247-··'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-withdraw-chip-all')));
      await tap(tester, find.byKey(const Key('professor-withdraw-continue')));
      expect(
          text(tester, 'professor-withdraw-review-amount'), contains('860,00'));
      expect(find.text('Grátis'), findsOneWidget);
      expect(inside('professor-withdraw-deadline', find.text('Após aprovação')),
          findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-withdraw-confirm')));
      await tap(
          tester, find.byKey(const Key('professor-withdraw-confirm-dialog')));
      expect(r.requested, [860]);
      expect(text(tester, 'professor-withdraw-done-title'), 'Saque enviado');
    });

    testWidgets('acima de R\$ 500: pendente com a mensagem do servidor',
        (tester) async {
      final r = repo(
        available: 900,
        result: const ProfessorWithdrawalResult(
          withdrawalId: 'w',
          status: 'pending',
          payoutStatus: 'pending',
          autoProcessed: false,
          processingMode: 'manual_review',
          message:
              'Saque acima de R\$ 500,00. Aguardando aprovação da plataforma.',
        ),
      );
      await pumpProfessorEarningsApp(
        tester,
        earnings: r,
        links: [professorLink()],
        location: AppRoutes.professorWithdraw,
      );
      await tester.enterText(
          find.byKey(const Key('professor-withdraw-amount')), '700');
      await settleProfessorStudents(tester, 2);
      await tap(tester, find.byKey(const Key('professor-withdraw-continue')));
      await tap(tester, find.byKey(const Key('professor-withdraw-confirm')));
      await tap(
          tester, find.byKey(const Key('professor-withdraw-confirm-dialog')));
      expect(r.requested, [700]);
      expect(text(tester, 'professor-withdraw-done-title'), 'Saque em análise');
      expect(text(tester, 'professor-withdraw-done-message'),
          contains('Aguardando aprovação'));
    });

    testWidgets('valor acima do saldo e sem chave', (tester) async {
      await pumpProfessorEarningsApp(
        tester,
        earnings: repo(available: 100),
        links: [professorLink()],
        location: AppRoutes.professorWithdraw,
      );
      await tester.enterText(
          find.byKey(const Key('professor-withdraw-amount')), '150');
      await settleProfessorStudents(tester, 2);
      await tap(tester, find.byKey(const Key('professor-withdraw-continue')));
      expect(find.text('Saldo insuficiente para este saque.'), findsOneWidget);

      await pumpProfessorEarningsApp(
        tester,
        earnings: repo(key: null),
        links: [professorLink()],
        location: AppRoutes.professorWithdraw,
      );
      await tap(tester, find.byKey(const Key('professor-withdraw-chip-100')));
      await tap(tester, find.byKey(const Key('professor-withdraw-continue')));
      expect(
          find.text('Cadastre sua chave PIX antes de sacar.'), findsOneWidget);
    });

    testWidgets('C9: trocar a chave valida e salva', (tester) async {
      final r = repo();
      await pumpProfessorEarningsApp(
        tester,
        earnings: r,
        links: [professorLink()],
        location: AppRoutes.professorPixKey,
      );
      await tap(tester, find.byKey(const Key('professor-pix-type-email')));
      final field = find.descendant(
        of: find.byKey(const Key('professor-pix-key')),
        matching: find.byType(TextField),
      );
      await tester.enterText(field, 'x');
      await tap(tester, find.byKey(const Key('professor-pix-save')));
      expect(find.text('E-mail inválido'), findsOneWidget);
      await tester.enterText(field, 'prof@exemplo.com');
      await tap(tester, find.byKey(const Key('professor-pix-save')));
      expect(r.savedKeys.single, (key: 'prof@exemplo.com', type: 'EMAIL'));
    });
  });

  group('C8 Histórico', () {
    testWidgets('situações e total do ano', (tester) async {
      await pumpProfessorEarningsApp(
        tester,
        earnings: repo(withdrawals: [
          withdrawal(id: 'a', amount: 300, at: DateTime(2026, 10, 12)),
          withdrawal(
              id: 'b',
              amount: 600,
              status: 'rejected',
              payoutStatus: 'failed',
              at: DateTime(2026, 10, 15),
              error: 'Conta encerrada'),
          withdrawal(
              id: 'c',
              amount: 900,
              status: 'pending',
              payoutStatus: 'pending',
              mode: 'manual_review',
              at: DateTime(2026, 10, 20)),
        ]),
        links: [professorLink()],
        location: AppRoutes.professorWithdrawals,
      );
      expect(text(tester, 'professor-withdrawal-status-a'), 'CONCLUÍDO');
      expect(text(tester, 'professor-withdrawal-status-b'),
          'FALHOU — DEVOLVIDO AO SALDO');
      expect(text(tester, 'professor-withdrawal-status-c'),
          'AGUARDANDO APROVAÇÃO');
      expect(find.text('Conta encerrada'), findsOneWidget);
      expect(
          text(tester, 'professor-withdrawals-year-total'), contains('300,00'));
    });
  });
}
