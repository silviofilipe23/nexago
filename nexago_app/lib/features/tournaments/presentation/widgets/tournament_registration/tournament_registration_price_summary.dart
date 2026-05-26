import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationPriceSummary extends StatelessWidget {
  const TournamentRegistrationPriceSummary({
    super.key,
    required this.quote,
    this.showTotal = true,
  });

  final TournamentRegistrationQuote quote;
  final bool showTotal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'RESUMO',
          style: AppTypography.mono(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 11,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            color: AppColors.surfaceRaised,
            border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
          ),
          child: Column(
            children: [
              _PriceRow(
                label: 'Inscrição da dupla',
                value: formatRegistrationMoney(quote.entryFee),
                valueStyle: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 12),
              _PriceRow(
                label: 'Taxa NexaGO',
                value: formatRegistrationMoney(quote.platformFee),
                hint: 'retida no pagamento',
                valueStyle: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              if (showTotal) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Divider(
                    height: 1,
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
                  ),
                ),
                Row(
                  children: [
                    Text(
                      'Total',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      formatRegistrationMoney(quote.displayTotal),
                      style: AppTypography.mono(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: AppColors.brand,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
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
    required this.label,
    required this.value,
    this.hint,
    this.valueStyle,
  });

  final String label;
  final String value;
  final String? hint;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (hint != null && hint!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  hint!,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.75),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 12),
        Text(value, style: valueStyle),
      ],
    );
  }
}
