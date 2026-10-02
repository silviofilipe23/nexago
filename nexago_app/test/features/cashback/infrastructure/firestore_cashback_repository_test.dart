import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/infrastructure/firestore_cashback_repository.dart';

void main() {
  group('cashbackWalletFromMap', () {
    test('doc ausente é a carteira zerada', () {
      final wallet = cashbackWalletFromMap(null);
      expect(wallet.availableCents, 0);
      expect(wallet.pendingCents, 0);
      expect(wallet.nextExpiryAt, isNull);
    });

    test('lê os totais e o próximo vencimento', () {
      final wallet = cashbackWalletFromMap({
        'uid': 'u1',
        'availableCents': 1240,
        'pendingCents': 480,
        'heldCents': 300,
        'lifetimeEarnedCents': 5000,
        'lifetimeRedeemedCents': 2000,
        'nextExpiryAt': Timestamp.fromDate(DateTime(2027, 3, 12, 10)),
        'nextExpiryCents': 320,
        'updatedAt': Timestamp.fromDate(DateTime(2026, 10, 2)),
      });
      expect(wallet.availableCents, 1240);
      expect(wallet.pendingCents, 480);
      expect(wallet.heldCents, 300);
      expect(wallet.lifetimeEarnedCents, 5000);
      expect(wallet.lifetimeRedeemedCents, 2000);
      expect(wallet.nextExpiryAt, DateTime(2027, 3, 12, 10));
      expect(wallet.nextExpiryCents, 320);
    });

    test('valor corrompido vira zero; fração arredonda; negativo não passa',
        () {
      final wallet = cashbackWalletFromMap({
        'availableCents': 240.0,
        'pendingCents': -5,
        'heldCents': '100',
        'nextExpiryAt': '2027-03-12',
      });
      expect(wallet.availableCents, 240);
      expect(wallet.pendingCents, 0);
      expect(wallet.heldCents, 0);
      expect(wallet.nextExpiryAt, isNull);
    });
  });

  group('cashbackLedgerEntryFromMap', () {
    test('lê tipo, valor, rótulo e data', () {
      final entry = cashbackLedgerEntryFromMap('e1', {
        'type': 'redeem',
        'amountCents': 1500,
        'label': ' Inscrição · Copa Verão ',
        'lotId': null,
        'holdId': 'h1',
        'createdAt': Timestamp.fromDate(DateTime(2026, 10, 5, 18)),
      });
      expect(entry.id, 'e1');
      expect(entry.type, CashbackLedgerType.redeem);
      expect(entry.amountCents, 1500);
      expect(entry.label, 'Inscrição · Copa Verão');
      expect(entry.createdAt, DateTime(2026, 10, 5, 18));
    });

    test('tipo desconhecido e campos ausentes não quebram', () {
      final entry = cashbackLedgerEntryFromMap('e2', {'type': 'bonus'});
      expect(entry.type, CashbackLedgerType.unknown);
      expect(entry.amountCents, 0);
      expect(entry.label, '');
      expect(entry.createdAt, isNull);
    });
  });

  group('cashbackLotFromMap', () {
    test('lote ausente é null', () {
      expect(cashbackLotFromMap('pay_1', null), isNull);
    });

    test('lê o lote pendente', () {
      final lot = cashbackLotFromMap('pay_1', {
        'status': 'pending',
        'earnedCents': 240,
        'remainingCents': 240,
        'label': 'Reserva · Arena Sol · 12/10',
        'eventAt': Timestamp.fromDate(DateTime(2026, 10, 12, 19)),
        'expiresAt': null,
      });
      expect(lot!.id, 'pay_1');
      expect(lot.status, CashbackLotStatus.pending);
      expect(lot.earnedCents, 240);
      expect(lot.eventAt, DateTime(2026, 10, 12, 19));
      expect(lot.expiresAt, isNull);
      expect(lot.isPendingEarn, isTrue);
    });
  });
}
