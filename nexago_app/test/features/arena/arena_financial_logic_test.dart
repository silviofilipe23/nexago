import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
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
    double? fee,
    double? net,
  }) {
    return ArenaWithdrawalItem(
      id: id,
      amountReais: amount,
      feeReais: fee,
      netReais: net,
      status: status,
      pixKey: 'key',
      createdAt: at,
      payoutStatus: payoutStatus,
    );
  }

  group('extrato do saque', () {
    test('com tarifa: exibe o líquido recebido e detalha bruto e tarifa', () {
      final items = buildFinancialMovements(
        ledger: [],
        withdrawals: [
          withdrawal(id: 'w1', amount: 100, fee: 1.75, net: 98.25, at: now),
        ],
        arenaName: 'Arena',
      );

      expect(items.single.amountReais, 98.25);
      expect(items.single.note, contains('tarifa'));
      expect(items.single.note, contains('100'));
      expect(items.single.note, contains('1,75'));
    });

    test('doc antigo sem tarifa: exibe só o valor, sem nota', () {
      final items = buildFinancialMovements(
        ledger: [],
        withdrawals: [withdrawal(id: 'w1', amount: 100, at: now)],
        arenaName: 'Arena',
      );

      expect(items.single.amountReais, 100);
      expect(items.single.note, isNull);
    });

    test('arena isenta (tarifa zero): líquido = bruto, sem nota de tarifa', () {
      final items = buildFinancialMovements(
        ledger: [],
        withdrawals: [
          withdrawal(id: 'w1', amount: 100, fee: 0, net: 100, at: now),
        ],
        arenaName: 'Arena',
      );

      expect(items.single.amountReais, 100);
      expect(items.single.note, isNull);
    });
  });

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
        now: now,
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

    test('PIX criado é ENVIADO; só a conclusão no Asaas é PAGO', () {
      expect(
        withdrawalStatusLabel(
          withdrawal(id: 'w2', amount: 10, at: now, payoutStatus: 'sent'),
        ),
        'ENVIADO',
      );
      expect(
        withdrawalStatusLabel(
          withdrawal(id: 'w3', amount: 10, at: now, payoutStatus: 'paid'),
        ),
        'PAGO',
      );
    });
  });

  // Espelha `arena-wallet.model.spec.ts` (PR #794 no portal da arena).
  group('carteira: a liberar e origem do extrato', () {
    test('lê o "a liberar" do cartão; doc antigo ou negativo vira zero', () {
      expect(
        ArenaWalletSummary.fromMap(const {
          'availableReais': 10,
          'pendingReais': 0,
          'awaitingSettlementReais': 6.64,
        }).awaitingSettlementReais,
        6.64,
      );
      expect(
        ArenaWalletSummary.fromMap(const {'availableReais': 10})
            .awaitingSettlementReais,
        0,
      );
      expect(
        ArenaWalletSummary.fromMap(const {'awaitingSettlementReais': -1})
            .awaitingSettlementReais,
        0,
      );
      expect(ArenaWalletSummary.fromMap(null).awaitingSettlementReais, 0);
    });

    test('mensalidade de aula e clubinho têm título próprio; reserva segue',
        () {
      final items = buildFinancialMovements(
        ledger: [
          ArenaLedgerEntry.fromMap('a', const {
            'type': 'credit',
            'source': 'class',
            'grossReais': 8.89,
            'netReais': 6.64,
            'bookingId': 'g1',
          }),
          ArenaLedgerEntry.fromMap('b', const {
            'type': 'credit',
            'source': 'club',
            'grossReais': 30,
            'netReais': 28.2,
          }),
          ArenaLedgerEntry.fromMap('c', const {
            'type': 'credit',
            'grossReais': 120,
            'netReais': 120,
            'bookingId': 'bk1',
          }),
        ],
        withdrawals: [],
        arenaName: 'Vegeton',
      );
      final byId = {for (final m in items) m.id: m};

      final aula = byId['ledger-a']!;
      expect(aula.title, 'Mensalidade de aula');
      expect(aula.amountReais, 6.64);
      expect(aula.note, 'Bruto ${formatBRL(8.89)} · taxas ${formatBRL(2.25)}');
      expect(aula.statusLabel, 'RECEBIDO');
      expect(aula.isPositive, isTrue);

      expect(byId['ledger-b']!.title, 'Clubinho');

      final reserva = byId['ledger-c']!;
      expect(reserva.title, 'Reserva · Vegeton');
      expect(reserva.note, isNull);
    });

    test('origem desconhecida cai em reserva', () {
      final entry = ArenaLedgerEntry.fromMap('x', const {
        'source': 'outra-coisa',
        'netReais': 10,
        'grossReais': 10,
      });
      expect(entry.source, ArenaLedgerSource.booking);
      expect(entry.type, 'credit');
    });

    test('estorno do clubinho sai como débito, não como "+R\$ -X"', () {
      final refund = ArenaLedgerEntry.fromMap('r', {
        'type': 'refund',
        'source': 'club',
        'grossReais': -28.2,
        'netReais': -28.2,
        'createdAt': null,
      });
      final m = buildFinancialMovements(
        ledger: [refund],
        withdrawals: [],
        arenaName: 'Arena',
      ).single;

      expect(m.title, 'Estorno · Clubinho');
      expect(m.isPositive, isFalse);
      expect(m.isRefund, isTrue);
      expect(m.amountReais, 28.2);
      expect(m.statusLabel, 'ESTORNADO');
      expect(m.note, isNull);
      // Segue no filtro de recebimentos, junto da linha que estornou.
      expect(
        filterFinancialMovements([m], ArenaFinancialHistoryFilter.receipts),
        hasLength(1),
      );
    });

    test('netReais negativo sem `type` também é estorno', () {
      final m = ledgerMovement(
        const ArenaLedgerEntry(
          id: 'n',
          netReais: -50,
          grossReais: -50,
          bookingId: null,
          createdAt: null,
        ),
        'Vegeton',
      );
      expect(m.title, 'Estorno · Reserva');
      expect(m.amountReais, 50);
      expect(m.isPositive, isFalse);
    });

    test('o "Recebido" do período desconta o estorno', () {
      final stats = computeFinancialPeriodStats(
        ledger: [
          ArenaLedgerEntry(
            id: 'c',
            netReais: 28.2,
            grossReais: 30,
            bookingId: null,
            createdAt: now,
            source: ArenaLedgerSource.club,
          ),
          ArenaLedgerEntry(
            id: 'r',
            netReais: -28.2,
            grossReais: -28.2,
            bookingId: null,
            createdAt: now,
            type: 'refund',
            source: ArenaLedgerSource.club,
          ),
        ],
        withdrawals: [],
        period: ArenaFinancialPeriod.d30,
        now: now,
      );
      expect(stats.receivedReais, closeTo(0, 0.001));
    });
  });
}
