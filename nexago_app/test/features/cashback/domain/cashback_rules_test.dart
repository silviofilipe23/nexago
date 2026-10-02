import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/domain/cashback_rules.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

void main() {
  group('reaisToCents', () {
    test('arredonda em vez de truncar', () {
      expect(reaisToCents(19.99), 1999);
      expect(reaisToCents(0.1 + 0.2), 30);
      expect(reaisToCents(120), 12000);
    });
  });

  group('redeemablePreviewCents', () {
    test('abate até deixar o mínimo em dinheiro', () {
      expect(
        redeemablePreviewCents(
          availableCents: 3000,
          priceCents: 2000,
          minCashCents: 500,
        ),
        1500,
      );
    });

    test('saldo menor que o teto é usado inteiro', () {
      expect(
        redeemablePreviewCents(
          availableCents: 300,
          priceCents: 5000,
          minCashCents: 500,
        ),
        300,
      );
    });

    test('preço no mínimo ou abaixo dele não usa saldo', () {
      expect(
        redeemablePreviewCents(
          availableCents: 3000,
          priceCents: 500,
          minCashCents: 500,
        ),
        0,
      );
      expect(
        redeemablePreviewCents(
          availableCents: 3000,
          priceCents: 400,
          minCashCents: 500,
        ),
        0,
      );
    });

    test('sem saldo é zero', () {
      expect(
        redeemablePreviewCents(
          availableCents: 0,
          priceCents: 5000,
          minCashCents: 500,
        ),
        0,
      );
    });
  });

  group('cashbackPillCents', () {
    test('ligado com saldo: disponível + pendente', () {
      expect(
        cashbackPillCents(
          config: ligado,
          wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
        ),
        1240,
      );
    });

    test('só pendente também acende a pílula', () {
      expect(
        cashbackPillCents(
          config: ligado,
          wallet: const CashbackWallet(pendingCents: 240),
        ),
        240,
      );
    });

    test('desligado, sem saldo ou carregando: escondida', () {
      expect(
        cashbackPillCents(
          config: CashbackConfig.fallback,
          wallet: const CashbackWallet(availableCents: 1000),
        ),
        isNull,
      );
      expect(
        cashbackPillCents(config: ligado, wallet: CashbackWallet.empty),
        isNull,
      );
      expect(
        cashbackPillCents(
          config: null,
          wallet: const CashbackWallet(availableCents: 1000),
        ),
        isNull,
      );
      expect(cashbackPillCents(config: ligado, wallet: null), isNull);
    });
  });

  group('quoteCheckoutCashback', () {
    CashbackCheckoutContext checkout(
      int available, {
      CashbackConfig config = ligado,
    }) =>
        CashbackCheckoutContext(config: config, availableCents: available);

    test('desligado, carregando ou sem preço: escondido', () {
      expect(
        quoteCheckoutCashback(
          priceCents: 2000,
          checkout: null,
          useCashback: true,
        ).mode,
        CashbackToggleMode.hidden,
      );
      expect(
        quoteCheckoutCashback(
          priceCents: 2000,
          checkout: checkout(3000, config: CashbackConfig.fallback),
          useCashback: true,
        ).mode,
        CashbackToggleMode.hidden,
      );
      expect(
        quoteCheckoutCashback(
          priceCents: 0,
          checkout: checkout(3000),
          useCashback: true,
        ).mode,
        CashbackToggleMode.hidden,
      );
    });

    test('nada do saldo cabe: só a linha de ganho, e nunca pede useCashback',
        () {
      final quote = quoteCheckoutCashback(
        priceCents: 500,
        checkout: checkout(3000),
        useCashback: true,
      );
      expect(quote.mode, CashbackToggleMode.earnHint);
      expect(quote.sendUseCashback, isFalse);
      expect(quote.chargePreviewCents, 500);
    });

    test('switch desligado: mostra o toggle e cobra o preço cheio', () {
      final quote = quoteCheckoutCashback(
        priceCents: 2000,
        checkout: checkout(3000),
        useCashback: false,
      );
      expect(quote.mode, CashbackToggleMode.toggle);
      expect(quote.redeemableCents, 1500);
      expect(quote.appliedPreviewCents, 0);
      expect(quote.chargePreviewCents, 2000);
      expect(quote.sendUseCashback, isFalse);
    });

    test('switch ligado: abate a prévia e avisa quando o mínimo segurou saldo',
        () {
      final quote = quoteCheckoutCashback(
        priceCents: 2000,
        checkout: checkout(3000),
        useCashback: true,
      );
      expect(quote.appliedPreviewCents, 1500);
      expect(quote.chargePreviewCents, 500);
      expect(quote.minCashHoldsBack, isTrue);
      expect(quote.sendUseCashback, isTrue);
    });

    test('saldo pequeno é usado inteiro, sem aviso do mínimo', () {
      final quote = quoteCheckoutCashback(
        priceCents: 5000,
        checkout: checkout(1000),
        useCashback: true,
      );
      expect(quote.appliedPreviewCents, 1000);
      expect(quote.chargePreviewCents, 4000);
      expect(quote.minCashHoldsBack, isFalse);
    });
  });

  group('extrato por mês', () {
    CashbackLedgerEntry entry(String id, DateTime? at) => CashbackLedgerEntry(
          id: id,
          type: CashbackLedgerType.release,
          amountCents: 100,
          createdAt: at,
        );

    test('agrupa mantendo a ordem (mais recente primeiro) e separa os anos', () {
      final months = groupLedgerByMonth([
        entry('a', DateTime(2027, 1, 3)),
        entry('b', DateTime(2026, 12, 30)),
        entry('c', DateTime(2026, 12, 2)),
        entry('d', DateTime(2026, 10, 12)),
      ]);
      expect(
        months.map((m) => m.title).toList(),
        ['janeiro de 2027', 'dezembro de 2026', 'outubro de 2026'],
      );
      expect(months[1].entries.map((e) => e.id).toList(), ['b', 'c']);
    });

    test('lançamento sem data vai para o fim', () {
      final months = groupLedgerByMonth([
        entry('a', null),
        entry('b', DateTime(2026, 3, 1)),
      ]);
      expect(
        months.map((m) => m.title).toList(),
        ['março de 2026', cashbackUndatedMonthTitle],
      );
    });

    test('data curta dd/MM', () {
      expect(cashbackShortDate(DateTime(2027, 3, 2)), '02/03');
      expect(cashbackMonthTitle(DateTime(2026, 10, 31)), 'outubro de 2026');
    });
  });

  group('formatCashbackRate', () {
    test('inteiro sem casas; fração com vírgula', () {
      expect(formatCashbackRate(2), '2');
      expect(formatCashbackRate(2.5), '2,5');
    });
  });
}
