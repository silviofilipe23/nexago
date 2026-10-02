import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';

void main() {
  group('CashbackCopy.howItWorks', () {
    test('cinco linhas com os valores da config', () {
      const config = CashbackConfig(
        enabled: true,
        ratePercent: 2.5,
        maxShareOfFee: 0.5,
        minCashCents: 750,
        expiryMonths: 12,
        expiryWarningDays: 15,
      );
      final lines = CashbackCopy.howItWorks(config);
      expect(lines, hasLength(5));
      expect(lines[0], contains('2,5%'));
      expect(lines[1], 'O cashback fica pendente e libera depois que o jogo acontece.');
      expect(lines[2], 'Vale por 12 meses depois de liberado.');
      expect(lines[3], contains(formatBRLFromCents(750)));
      expect(lines[4], 'Não pode ser sacado nem transferido.');
    });

    test('validade de 1 mês no singular', () {
      const config = CashbackConfig(
        enabled: true,
        ratePercent: 2,
        maxShareOfFee: 0.5,
        minCashCents: 500,
        expiryMonths: 1,
        expiryWarningDays: 15,
      );
      expect(
        CashbackCopy.howItWorks(config)[2],
        'Vale por 1 mês depois de liberado.',
      );
    });
  });

  group('linhas do extrato', () {
    test('sinal pelo tipo e sufixo "pendente" só no ganho', () {
      final earn = CashbackLedgerEntry(
        id: 'a',
        type: CashbackLedgerType.earn,
        amountCents: 240,
        createdAt: DateTime(2026, 9, 28, 9),
      );
      const redeem = CashbackLedgerEntry(
        id: 'b',
        type: CashbackLedgerType.redeem,
        amountCents: 1500,
      );
      expect(CashbackCopy.signedAmount(earn), '+${formatBRLFromCents(240)}');
      expect(
        CashbackCopy.signedAmount(redeem),
        '−${formatBRLFromCents(1500)}',
      );
      expect(CashbackCopy.ledgerMeta(earn), 'pendente · 28/09');
      expect(CashbackCopy.ledgerMeta(redeem), '');
    });
  });
}
