import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationPaymentStep extends StatelessWidget {
  const TournamentRegistrationPaymentStep({
    super.key,
    required this.category,
    required this.quote,
    required this.paymentType,
    required this.onPaymentTypeChanged,
    this.dualPaymentOnly = false,
    this.progressLabel,
    this.isFullyPaid = false,
  });

  final TournamentCategoryOffer category;
  final TournamentRegistrationQuote quote;
  final String paymentType;
  final ValueChanged<String> onPaymentTypeChanged;
  final bool dualPaymentOnly;
  final String? progressLabel;
  final bool isFullyPaid;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final amountLabel = paymentAmountLabel(
      quote: quote,
      amountType: paymentType,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'PAGAMENTO',
          style: AppTypography.mono(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 11,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          category.name,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          dualPaymentOnly
              ? 'Cada atleta paga sua parcela. A inscrição da dupla é confirmada quando os dois pagarem.'
              : 'Escolha como deseja pagar a inscrição.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
        if (progressLabel != null && progressLabel!.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isFullyPaid
                  ? AppColors.win.withValues(alpha: 0.12)
                  : AppColors.pending.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: (isFullyPaid ? AppColors.win : AppColors.pending)
                    .withValues(alpha: 0.35),
              ),
            ),
            child: Text(
              progressLabel!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: isFullyPaid ? AppColors.win : AppColors.onSurface,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
        if (!dualPaymentOnly) ...[
          const SizedBox(height: 16),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'share',
                label: Text('Minha parte'),
              ),
              ButtonSegment(
                value: 'full',
                label: Text('Integral'),
              ),
            ],
            selected: {paymentType},
            onSelectionChanged: (selection) {
              if (selection.isEmpty) return;
              onPaymentTypeChanged(selection.first);
            },
          ),
        ],
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              Text(
                paymentType == 'full' ? 'Total da dupla' : 'Sua parcela',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Text(
                amountLabel,
                style: AppTypography.mono(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: AppColors.brand,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
