import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/cashback_models.dart';
import '../../domain/cashback_rules.dart';
import '../cashback_copy.dart';

/// "Usar meu cashback" no checkout, ANTES de gerar a cobrança (some depois que
/// o QR existe). Controlado: a página guarda o valor — começa DESLIGADO, o
/// atleta escolhe gastar — e manda `useCashback: true` só com ele ligado.
///
/// Três estados (os mesmos do portal):
/// - recurso desligado → nada;
/// - ligado sem saldo usável (inclusive preço no mínimo em dinheiro) → só a
///   linha "Ganhe até X% de volta neste pagamento";
/// - ligado com saldo usável → o switch, a prévia e a linha de resumo.
class CheckoutCashbackToggle extends StatelessWidget {
  const CheckoutCashbackToggle({
    super.key,
    required this.priceCents,
    required this.availableCents,
    required this.config,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  static const Key switchKey = ValueKey('checkout-cashback-switch');

  /// Preço desta cobrança (na reserva com sinal, o valor a pagar AGORA).
  final int priceCents;
  final int availableCents;
  final CashbackConfig config;
  final bool value;
  final ValueChanged<bool> onChanged;

  /// Falso enquanto a cobrança está sendo gerada.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final quote = quoteCheckoutCashback(
      priceCents: priceCents,
      checkout: CashbackCheckoutContext(
        config: config,
        availableCents: availableCents,
      ),
      useCashback: value,
    );
    return switch (quote.mode) {
      CashbackToggleMode.hidden => const SizedBox.shrink(),
      CashbackToggleMode.earnHint =>
        _CashbackLine(text: CashbackCopy.earnHint(config)),
      CashbackToggleMode.toggle => _ToggleCard(
          quote: quote,
          minCashCents: config.minCashCents,
          value: value,
          enabled: enabled,
          onChanged: onChanged,
        ),
    };
  }
}

/// Depois da cobrança: quanto do saldo o SERVIDOR aplicou (pode ser menos que
/// a prévia, se o saldo mudou no meio). Nada quando não aplicou.
class CheckoutCashbackAppliedNote extends StatelessWidget {
  const CheckoutCashbackAppliedNote({super.key, required this.appliedCents});

  final int appliedCents;

  @override
  Widget build(BuildContext context) {
    if (appliedCents <= 0) return const SizedBox.shrink();
    return _CashbackLine(text: CashbackCopy.appliedNote(appliedCents));
  }
}

class _CashbackLine extends StatelessWidget {
  const _CashbackLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.savings_outlined, size: 16, color: AppColors.win),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
      ],
    );
  }
}

class _ToggleCard extends StatelessWidget {
  const _ToggleCard({
    required this.quote,
    required this.minCashCents,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final CashbackCheckoutQuote quote;
  final int minCashCents;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final muted = theme.textTheme.bodySmall?.copyWith(
      color: colors.onSurfaceMuted,
    );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: value
              ? AppColors.win.withValues(alpha: 0.45)
              : colors.surfaceRaised,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.savings_outlined,
                color: AppColors.win,
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      CashbackCopy.toggleTitle,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      value
                          ? CashbackCopy.using(quote.redeemableCents)
                          : CashbackCopy.availableToUse(quote.availableCents),
                      style: muted,
                    ),
                    if (value && quote.minCashHoldsBack)
                      Text(CashbackCopy.minCashNote(minCashCents), style: muted),
                  ],
                ),
              ),
              Switch(
                key: CheckoutCashbackToggle.switchKey,
                value: value,
                onChanged: enabled ? onChanged : null,
                activeTrackColor: AppColors.win.withValues(alpha: 0.45),
                activeThumbColor: AppColors.win,
              ),
            ],
          ),
          if (value) ...[
            const SizedBox(height: 10),
            Divider(height: 1, color: colors.surfaceRaised),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(CashbackCopy.summaryLabel, style: muted),
                ),
                Text(
                  CashbackCopy.summaryAmount(quote.redeemableCents),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.win,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
