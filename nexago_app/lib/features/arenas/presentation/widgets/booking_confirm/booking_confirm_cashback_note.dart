import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../cashback/application/cashback_providers.dart';
import '../../../../cashback/domain/cashback_rules.dart';
import '../../../../cashback/presentation/cashback_copy.dart';

/// Cashback no recibo, para quem vai pagar pelo app. Só informa: o saldo é
/// aplicado (ou não) no switch da tela do Pix, que fala com o servidor. Com o
/// recurso desligado, carregando ou nada a pagar, não aparece.
class BookingConfirmCashbackNote extends ConsumerWidget {
  const BookingConfirmCashbackNote({super.key, required this.amountDueReais});

  static const noteKey = Key('booking-confirm-cashback-note');

  /// O que vai ser cobrado no app (sem o mínimo em dinheiro já descontado).
  final double amountDueReais;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = cashbackNoteText(
      checkout: ref.watch(cashbackCheckoutContextProvider),
      amountDueReais: amountDueReais,
    );
    if (text == null) return const SizedBox.shrink();

    final colors = context.themeColors;
    return Row(
      key: noteKey,
      children: [
        Icon(
          Icons.savings_rounded,
          size: 18,
          color: colors.readableTone(AppColors.win),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurface,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
          ),
        ),
      ],
    );
  }
}

/// Texto da nota: o saldo que cabe nesta cobrança, ou "ganhe até X%" sem
/// saldo a usar; `null` com o recurso desligado, carregando ou nada a pagar.
String? cashbackNoteText({
  required CashbackCheckoutContext? checkout,
  required double amountDueReais,
}) {
  if (checkout == null) return null;
  final quote = quoteCheckoutCashback(
    priceCents: reaisToCents(amountDueReais),
    checkout: checkout,
    useCashback: false,
  );
  return switch (quote.mode) {
    CashbackToggleMode.hidden => null,
    CashbackToggleMode.earnHint => CashbackCopy.earnHint(checkout.config),
    CashbackToggleMode.toggle =>
      'Você tem ${formatBRLFromCents(quote.redeemableCents)} de cashback '
          'para usar neste pagamento, na próxima etapa.',
  };
}
