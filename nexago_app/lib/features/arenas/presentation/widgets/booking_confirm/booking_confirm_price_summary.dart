import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingConfirmPriceSummary extends StatelessWidget {
  const BookingConfirmPriceSummary({
    super.key,
    required this.courtLineLabel,
    required this.courtAmountLabel,
    this.platformFeeLabel = 'Grátis',
    this.discountLineLabel,
    this.discountAmountLabel,
    this.totalAmountLabel,
    this.weatherCreditAmountLabel,
    this.totalLineLabel = 'Total',
    this.memberHoursLineLabel,
    this.memberHoursAmountLabel,
  });

  final String courtLineLabel;
  final String courtAmountLabel;
  final String platformFeeLabel;

  /// Desconto de professor ("Desconto de professor (20%)" / "−R$ 20,00").
  /// Com os dois, o resumo mostra a linha do desconto.
  ///
  /// [totalAmountLabel] é o total do recibo, mostrado sempre que vier,
  /// depois da linha da taxa ([platformFeeLabel]: o atleta não paga taxa na
  /// reserva; os 5% da plataforma saem da arena).
  final String? discountLineLabel;
  final String? discountAmountLabel;
  final String? totalAmountLabel;

  /// Crédito de chuva aplicado ("− R$ 60,00"). Com ele, o resumo mostra a
  /// linha do crédito e o total ([totalLineLabel], ex.: "A pagar").
  final String? weatherCreditAmountLabel;
  final String totalLineLabel;

  /// Banco de horas do mensalista ("Banco de horas · 1h" / "−R$ 150,00").
  /// Soma com o desconto do perfil/professor (o banco entra por cima).
  final String? memberHoursLineLabel;
  final String? memberHoursAmountLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasDiscount =
        discountLineLabel != null && discountAmountLabel != null;
    final hasCredit = weatherCreditAmountLabel != null;
    final hasMemberHours =
        memberHoursLineLabel != null && memberHoursAmountLabel != null;
    // Desconto, crédito e taxa grátis: o que deixa mais barato, em verde.
    final freeStyle = theme.textTheme.bodyLarge?.copyWith(
      fontWeight: FontWeight.w700,
      color: context.themeColors.readableTone(AppColors.win),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'RESUMO DE VALORES',
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            color: context.themeColors.surfaceRaised,
            border: Border.all(
                color: context.themeColors.outline.withValues(alpha: 0.25)),
          ),
          child: Column(
            children: [
              _PriceRow(
                label: courtLineLabel,
                value: courtAmountLabel,
                valueStyle: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurface,
                ),
              ),
              if (hasDiscount) ...[
                const SizedBox(height: 10),
                _PriceRow(
                  key: const Key('booking-confirm-professor-discount'),
                  label: discountLineLabel!,
                  value: discountAmountLabel!,
                  valueStyle: freeStyle,
                ),
              ],
              if (hasMemberHours) ...[
                const SizedBox(height: 10),
                _PriceRow(
                  key: const Key('booking-confirm-member-hours'),
                  label: memberHoursLineLabel!,
                  value: memberHoursAmountLabel!,
                  valueStyle: freeStyle,
                ),
              ],
              if (hasCredit) ...[
                const SizedBox(height: 10),
                _PriceRow(
                  key: const Key('booking-confirm-weather-credit'),
                  label: 'Crédito na arena',
                  value: weatherCreditAmountLabel!,
                  valueStyle: freeStyle,
                ),
              ],
              const SizedBox(height: 10),
              _PriceRow(
                key: const Key('booking-confirm-fee'),
                label: 'Taxa de serviço',
                value: platformFeeLabel,
                valueStyle: freeStyle,
              ),
              if (totalAmountLabel != null) ...[
                const SizedBox(height: 10),
                Divider(
                  height: 1,
                  color: context.themeColors.outline.withValues(alpha: 0.25),
                ),
                const SizedBox(height: 10),
                _PriceRow(
                  key: const Key('booking-confirm-total'),
                  label: totalLineLabel,
                  value: totalAmountLabel!,
                  valueStyle: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    super.key,
    required this.label,
    required this.value,
    this.valueStyle,
  });

  final String label;
  final String value;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Text(
          value,
          style: valueStyle ??
              theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
