import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/data/arena_wallet_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_financial_logic.dart';

void main() {
  final now = DateTime(2026, 6, 25, 12);

  ArenaLedgerEntry ledger({
    required String id,
    required double net,
    required DateTime at,
  }) {
    return ArenaLedgerEntry(
      id: id,
      netReais: net,
      grossReais: net,
      bookingId: 'booking-$id',
      createdAt: at,
    );
  }

  ArenaWithdrawalItem withdrawal({
    required String id,
    required double amount,
    required DateTime at,
    String status = 'approved',
    String? payoutStatus = 'sent',
  }) {
    return ArenaWithdrawalItem(
      id: id,
      amountReais: amount,
      status: status,
      pixKey: 'key',
      createdAt: at,
      payoutStatus: payoutStatus,
    );
  }

  group('buildFinancialMovements', () {
    test('merges ledger and withdrawals sorted by date desc', () {
      final items = buildFinancialMovements(
        ledger: [
          ledger(id: '1', net: 98, at: now.subtract(const Duration(hours: 2))),
        ],
        withdrawals: [
          withdrawal(
            id: 'w1',
            amount: 150,
            at: now.subtract(const Duration(hours: 1)),
          ),
        ],
        arenaName: 'Arena Central',
      );

      expect(items, hasLength(2));
      expect(items.first.kind, ArenaFinancialMovementKind.withdrawal);
      expect(items.last.title, contains('Arena Central'));
    });
  });

  group('filterFinancialMovements', () {
    test('filters receipts and withdrawals', () {
      final all = buildFinancialMovements(
        ledger: [ledger(id: '1', net: 50, at: now)],
        withdrawals: [withdrawal(id: 'w1', amount: 20, at: now)],
        arenaName: 'Arena',
      );

      expect(
        filterFinancialMovements(all, ArenaFinancialHistoryFilter.receipts),
        hasLength(1),
      );
      expect(
        filterFinancialMovements(all, ArenaFinancialHistoryFilter.withdrawals),
        hasLength(1),
      );
    });
  });

  group('computeFinancialPeriodStats', () {
    test('sums received and withdrawn in period', () {
      final stats = computeFinancialPeriodStats(
        ledger: [
          ledger(id: '1', net: 100, at: now.subtract(const Duration(days: 3))),
          ledger(id: '2', net: 50, at: now.subtract(const Duration(days: 40))),
        ],
        withdrawals: [
          withdrawal(
            id: 'w1',
            amount: 30,
            at: now.subtract(const Duration(days: 2)),
          ),
        ],
        period: ArenaFinancialPeriod.d30,
      );

      expect(stats.receivedReais, 100);
      expect(stats.withdrawnReais, 30);
    });
  });

  group('withdrawalStatusLabel', () {
    test('maps failed payout', () {
      expect(
        withdrawalStatusLabel(
          withdrawal(
            id: 'w1',
            amount: 10,
            at: now,
            payoutStatus: 'failed',
          ),
        ),
        'FALHOU',
      );
    });
  });
}
