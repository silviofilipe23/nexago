import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingPixAmountSection extends StatelessWidget {
  const BookingPixAmountSection({
    super.key,
    required this.totalReais,
    required this.selectedFraction,
    required this.onFractionChanged,
    this.enabled = true,
  });

  final double totalReais;
  final double selectedFraction;
  final ValueChanged<double> onFractionChanged;
  final bool enabled;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

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
        Row(
          children: [
            Expanded(
              child: _AmountOptionCard(
                title: 'Total agora',
                amount: _currency.format(payFull),
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
                amount: _currency.format(payHalf),
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
                  color: selected ? AppColors.brand : context.themeColors.onSurface,
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
