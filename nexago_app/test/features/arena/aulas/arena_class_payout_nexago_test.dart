import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/data/arena_class_repository.dart';
import 'package:nexago_app/features/arena/data/arena_wallet_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_financial_logic.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/arena_wallet_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout_logic.dart';

import 'arena_class_fixtures.dart';
import 'arena_class_payout_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_payout_repository.dart';
import 'fake_arena_class_repository.dart';

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

FakeArenaClassPayoutRepository _repo(ArenaClassPayout p) =>
    FakeArenaClassPayoutRepository(
      teachers: [teacher(id: 't1', name: 'Thiago Mendes')],
      previews: {
        '2026-09': monthPreview('2026-09', [
          previewTeacher(id: 't1', name: 'Thiago Mendes', amount: 960),
        ]),
      },
      payouts: [p],
    );

Future<void> _open(
  WidgetTester tester,
  FakeArenaClassPayoutRepository repo, {
  bool owner = true,
  double cash = 2000,
}) =>
    pumpAulas(
      tester,
      repo: FakeArenaClassRepository(
        classes: [arenaClass(id: 'c1', teacherId: 't1')],
      ),
      role: ArenaStaffRole.gestor,
      owner: owner,
      payoutRepo: repo,
      initial: '/arena/classes/payouts/t1?month=2026-09',
      overrides: [
        arenaWalletSummaryProvider('a1').overrideWith(
          (ref) => Stream.value(
            ArenaWalletSummary(availableReais: cash, pendingReais: 0),
          ),
        ),
      ],
    );

void main() {
  group('modelo e extrato', () {
    test('lê teacherUserId e o pagamento pelo nexaGO', () {
      final p = ArenaClassPayout.fromMap('x', const {
        'teacherUserId': 'prof-1',
        'status': 'paid',
        'paymentMethod': 'nexago',
        'paidOn': '2026-10-05',
        'amountReais': 960,
      });
      expect(p.teacherUserId, 'prof-1');
      expect(p.paidViaNexago, isTrue);
      expect(p.paymentMethod, isNull);
      expect(p.canPayViaNexago, isFalse);
      expect(
        arenaClassPayoutAmountSub(ArenaClassPayoutState.paid, p),
        'Pago pelo nexaGO · 05 out',
      );
      final open = ArenaClassPayout.fromMap('y', const {
        'teacherUserId': 'prof-1',
        'status': 'closed',
        'amountReais': 960,
      });
      expect(open.canPayViaNexago, isTrue);
    });

    test('linha de repasse no extrato não é estorno nem recebimento', () {
      final entry = ArenaLedgerEntry.fromMap('l1', const {
        'type': 'class_payout',
        'teacherName': 'Thiago Mendes',
        'month': '2026-09',
        'grossReais': 960,
        'netReais': -960,
      });
      expect(entry.isClassPayout, isTrue);
      expect(entry.isRefund, isFalse);
      final m = ledgerMovement(entry, 'Arena');
      expect(m.title, 'Repasse · Thiago Mendes · set/2026');
      expect(m.amountReais, 960);
      expect(m.isRefund, isFalse);
      expect(m.statusLabel, 'PAGO');

      final now = DateTime(2026, 10, 20);
      final stats = computeFinancialPeriodStats(
        ledger: [
          ArenaLedgerEntry(
            id: 'a',
            netReais: 100,
            grossReais: 100,
            bookingId: null,
            createdAt: now,
          ),
          ArenaLedgerEntry(
            id: 'b',
            netReais: -960,
            grossReais: 960,
            bookingId: null,
            createdAt: now,
            type: 'class_payout',
          ),
        ],
        withdrawals: const [],
        period: ArenaFinancialPeriod.d30,
        now: now,
      );
      expect(stats.receivedReais, 100);
      // Estorno de verdade continua estorno.
      expect(
        ArenaLedgerEntry.fromMap('r', const {'netReais': -50}).isRefund,
        isTrue,
      );
    });
  });

  group('pagar pelo nexaGO', () {
    testWidgets('dono: opção destacada, confirma com o saldo do caixa',
        (tester) async {
      final repo = _repo(payout(
        teacherId: 't1',
        month: '2026-09',
        computed: 960,
        teacherUserId: 'prof-1',
      ));
      await _open(tester, repo);
      await _tap(tester, find.text('Registrar pagamento'));
      expect(find.byKey(const Key('arena-payout-nexago')), findsOneWidget);
      expect(find.textContaining('caixa ${formatBRL(2000)}'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('arena-payout-nexago-submit')));
      expect(find.text('Pagar pelo nexaGO?'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('arena-payout-nexago-confirm')));
      expect(repo.nexagoCalls, ['a1_t1_2026-09']);
      expect(repo.paidCalls, isEmpty);
    });

    testWidgets('caixa não cobre: botão desligado', (tester) async {
      final repo = _repo(payout(
        teacherId: 't1',
        month: '2026-09',
        computed: 960,
        teacherUserId: 'prof-1',
      ));
      await _open(tester, repo, cash: 100);
      await _tap(tester, find.text('Registrar pagamento'));
      expect(find.textContaining('não cobre o repasse'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('arena-payout-nexago-submit')));
      expect(find.text('Pagar pelo nexaGO?'), findsNothing);
    });

    testWidgets('erro do servidor aparece na folha', (tester) async {
      final repo = _repo(payout(
        teacherId: 't1',
        month: '2026-09',
        computed: 960,
        teacherUserId: 'prof-1',
      ))
        ..nexagoError =
            ArenaClassException('Só o dono da arena paga repasse pelo nexaGO.');
      await _open(tester, repo);
      await _tap(tester, find.text('Registrar pagamento'));
      await _tap(tester, find.byKey(const Key('arena-payout-nexago-submit')));
      await _tap(tester, find.byKey(const Key('arena-payout-nexago-confirm')));
      expect(find.text('Só o dono da arena paga repasse pelo nexaGO.'),
          findsOneWidget);
    });

    testWidgets('gestor (não dono): sem a opção, só registro por fora',
        (tester) async {
      final repo = _repo(payout(
        teacherId: 't1',
        month: '2026-09',
        computed: 960,
        teacherUserId: 'prof-1',
      ));
      await _open(tester, repo, owner: false);
      await _tap(tester, find.text('Registrar pagamento'));
      expect(find.byKey(const Key('arena-payout-nexago')), findsNothing);
      expect(find.textContaining('Só o dono da arena paga'), findsOneWidget);
      await _tap(tester, find.text('Confirmar pagamento'));
      expect(repo.paidCalls.single.$2, ArenaClassPayoutMethod.pix);
    });

    testWidgets('pago pelo nexaGO: rótulo e sem desfazer', (tester) async {
      final repo = _repo(payout(
        teacherId: 't1',
        month: '2026-09',
        status: 'paid',
        paidOn: '2026-10-05',
        teacherUserId: 'prof-1',
        paidViaNexago: true,
      ));
      await _open(tester, repo);
      expect(find.text('Pago pelo nexaGO · 05 out'), findsOneWidget);
      expect(find.text('Desfazer pagamento'), findsNothing);
      expect(find.byKey(const Key('arena-payout-paid-nexago')), findsOneWidget);
    });
  });
}
