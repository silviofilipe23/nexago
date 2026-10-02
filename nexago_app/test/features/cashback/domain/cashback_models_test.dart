import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';

void main() {
  group('CashbackConfig.fromMap', () {
    test('doc ausente cai no padrão, desligado', () {
      final config = CashbackConfig.fromMap(null);
      expect(config.enabled, isFalse);
      expect(config.ratePercent, 2);
      expect(config.maxShareOfFee, 0.5);
      expect(config.minCashCents, 500);
      expect(config.expiryMonths, 6);
      expect(config.expiryWarningDays, 15);
    });

    test('lê os campos válidos e converte o mínimo para centavos', () {
      final config = CashbackConfig.fromMap({
        'enabled': true,
        'ratePercent': 3,
        'maxShareOfFee': 0.4,
        'minCashReais': 7.5,
        'expiryMonths': 12,
        'expiryWarningDays': 10,
      });
      expect(config.enabled, isTrue);
      expect(config.ratePercent, 3);
      expect(config.maxShareOfFee, 0.4);
      expect(config.minCashCents, 750);
      expect(config.expiryMonths, 12);
      expect(config.expiryWarningDays, 10);
    });

    test('campo fora da faixa ou de outro tipo volta ao padrão (como o backend)',
        () {
      final config = CashbackConfig.fromMap({
        'enabled': 'true',
        'ratePercent': 50,
        'maxShareOfFee': '0.5',
        'minCashReais': -1,
        'expiryMonths': 0,
        'expiryWarningDays': double.nan,
      });
      expect(config.enabled, isFalse);
      expect(config.ratePercent, 2);
      expect(config.maxShareOfFee, 0.5);
      expect(config.minCashCents, 500);
      expect(config.expiryMonths, 6);
      expect(config.expiryWarningDays, 15);
    });
  });

  group('CashbackWallet', () {
    test('vazia é zerada e o saldo da pílula soma disponível + pendente', () {
      expect(CashbackWallet.empty.balanceCents, 0);
      expect(CashbackWallet.empty.nextExpiryAt, isNull);
      expect(
        const CashbackWallet(
          availableCents: 1000,
          pendingCents: 240,
          heldCents: 500,
        ).balanceCents,
        1240,
      );
    });
  });

  group('CashbackLot', () {
    test('status do servidor; qualquer outra coisa vira unknown', () {
      expect(CashbackLotStatus.from('pending'), CashbackLotStatus.pending);
      expect(CashbackLotStatus.from(' cancelled '), CashbackLotStatus.cancelled);
      expect(CashbackLotStatus.from('unknown'), CashbackLotStatus.unknown);
      expect(CashbackLotStatus.from(42), CashbackLotStatus.unknown);
    });

    test('só lote pendente com ganho é anunciado na tela de sucesso', () {
      CashbackLot lot(CashbackLotStatus status, int cents) => CashbackLot(
            id: 'pay_1',
            status: status,
            earnedCents: cents,
            remainingCents: cents,
          );
      expect(lot(CashbackLotStatus.pending, 240).isPendingEarn, isTrue);
      expect(lot(CashbackLotStatus.pending, 0).isPendingEarn, isFalse);
      expect(lot(CashbackLotStatus.cancelled, 240).isPendingEarn, isFalse);
      expect(lot(CashbackLotStatus.available, 240).isPendingEarn, isFalse);
    });
  });

  group('CashbackLedgerEntry', () {
    CashbackLedgerEntry entry(CashbackLedgerType type) =>
        CashbackLedgerEntry(id: 'e', type: type, amountCents: 100);

    test('título, sinal e tom por tipo', () {
      final expected = <CashbackLedgerType, (String, bool, CashbackLedgerTone)>{
        CashbackLedgerType.earn: (
          'Cashback ganho',
          true,
          CashbackLedgerTone.pending,
        ),
        CashbackLedgerType.release: (
          'Cashback liberado',
          true,
          CashbackLedgerTone.positive,
        ),
        CashbackLedgerType.cancel: (
          'Cashback cancelado',
          false,
          CashbackLedgerTone.muted,
        ),
        CashbackLedgerType.redeem: (
          'Usado no pagamento',
          false,
          CashbackLedgerTone.brand,
        ),
        CashbackLedgerType.expire: ('Venceu', false, CashbackLedgerTone.muted),
        CashbackLedgerType.reverse: (
          'Estornado',
          false,
          CashbackLedgerTone.muted,
        ),
        CashbackLedgerType.refund: (
          'Devolvido ao saldo',
          true,
          CashbackLedgerTone.positive,
        ),
      };
      for (final item in expected.entries) {
        final (title, credit, tone) = item.value;
        final e = entry(item.key);
        expect(e.title, title, reason: item.key.name);
        expect(e.isCredit, credit, reason: item.key.name);
        expect(e.tone, tone, reason: item.key.name);
      }
    });

    test('tipo que o app não conhece não quebra o extrato', () {
      expect(CashbackLedgerType.from('bonus'), CashbackLedgerType.unknown);
      expect(CashbackLedgerType.from(null), CashbackLedgerType.unknown);
      expect(CashbackLedgerType.from('redeem'), CashbackLedgerType.redeem);
      expect(entry(CashbackLedgerType.unknown).title, 'Movimento');
    });
  });
}
