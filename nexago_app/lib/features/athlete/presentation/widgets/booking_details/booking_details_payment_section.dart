import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'booking_details_section_card.dart';
import 'booking_details_view_model.dart';

class BookingDetailsPaymentSection extends StatelessWidget {
  const BookingDetailsPaymentSection({
    super.key,
    required this.startAt,
    required this.endAt,
    required this.amountLabel,
    required this.paymentMethodLabel,
    required this.showSplitCard,
    this.splitPerPersonLabel,
  });

  final DateTime startAt;
  final DateTime endAt;
  final String amountLabel;
  final String paymentMethodLabel;
  final bool showSplitCard;
  final String? splitPerPersonLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final duration = formatBookingDurationLabel(startAt, endAt);

    return BookingDetailsSectionCard(
      title: 'Pagamento',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Valor da quadra ($duration)',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
              Text(
                amountLabel,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(
                Icons.credit_card_outlined,
                size: 18,
                color: context.themeColors.onSurfaceMuted,
              ),
              const SizedBox(width: 8),
              Text(
                paymentMethodLabel,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          if (showSplitCard && splitPerPersonLabel != null) ...[
            const SizedBox(height: 14),
            _SplitPaymentCard(perPersonLabel: splitPerPersonLabel!),
          ],
        ],
      ),
    );
  }
}

class _SplitPaymentCard extends StatelessWidget {
  const _SplitPaymentCard({required this.perPersonLabel});

  final String perPersonLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.groups_outlined,
              color: AppColors.brand,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Rachar com a equipe',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$perPersonLabel por pessoa · cobra via PIX',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.chevron_right_rounded,
            color: AppColors.brand,
          ),
        ],
      ),
    );
  }
}
