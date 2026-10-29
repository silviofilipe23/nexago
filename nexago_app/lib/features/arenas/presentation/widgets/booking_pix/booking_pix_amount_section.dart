import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/formatting/app_currency_format.dart';

class BookingPixAmountSection extends StatelessWidget {
  const BookingPixAmountSection({
    super.key,
    required this.totalReais,
    required this.selectedFraction,
    required this.onFractionChanged,
    this.enabled = true,
    this.allowDeposit = true,
    this.weatherCreditReais = 0,
  });

  final double totalReais;
  final double selectedFraction;
  final ValueChanged<double> onFractionChanged;
  final bool enabled;

  /// `false` com crédito de chuva aplicado: o servidor cobra o resto
  /// integral, então só aparece o "Total agora".
  final bool allowDeposit;

  /// Crédito de chuva já descontado do total (só para o rodapé).
  final double weatherCreditReais;


  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final payFull = totalReais;
    final payHalf = ((totalReais * 0.5) * 100).roundToDouble() / 100;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'VALOR A PAGAR',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        SizedBox(height: 10),
        if (!allowDeposit)
          _AmountOptionCard(
            key: const Key('booking-pix-full-only'),
            title: 'Total agora',
            amount: formatBRL(payFull),
            footer: weatherCreditReais > 0
                ? 'Crédito de chuva de ${formatBRL(weatherCreditReais)} já '
                      'descontado. O resto é pago integral.'
                : 'Garante 100% da reserva',
            selected: true,
            enabled: enabled,
            onTap: () => onFractionChanged(1.0),
          )
        else
          Row(
            children: [
              Expanded(
                child: _AmountOptionCard(
                  title: 'Total agora',
                  amount: formatBRL(payFull),
                  footer: 'Garante 100% da reserva',
                  selected: selectedFraction >= 0.99,
                  enabled: enabled,
                  onTap: () => onFractionChanged(1.0),
                ),
              ),
              SizedBox(width: 10),
              Expanded(
                child: _AmountOptionCard(
                  title: 'Apenas sinal · 50%',
                  amount: formatBRL(payHalf),
                  footer: 'Resto na arena',
                  selected: selectedFraction <= 0.51,
                  enabled: enabled,
                  onTap: () => onFractionChanged(0.5),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _AmountOptionCard extends StatelessWidget {
  const _AmountOptionCard({
    super.key,
    required this.title,
    required this.amount,
    required this.footer,
    required this.selected,
    required this.onTap,
    this.enabled = true,
  });

  final String title;
  final String amount;
  final String footer;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.surfaceRaised,
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: selected
                      ? context.themeColors.brandText
                      : context.themeColors.onSurface,
                ),
              ),
              SizedBox(height: 6),
              Text(
                amount,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                ),
              ),
              SizedBox(height: 4),
              Text(
                footer,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
