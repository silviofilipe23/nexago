import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

class BookingConfirmStickyBar extends StatelessWidget {
  const BookingConfirmStickyBar({
    super.key,
    required this.enabled,
    required this.onConfirm,
    this.metaLabel,
    this.totalLabel,
    this.ctaLabel = 'Confirmar e pagar',
    this.submitting = false,
  });

  final bool enabled;
  final VoidCallback onConfirm;
  final String? metaLabel;
  final String? totalLabel;
  final String ctaLabel;
  final bool submitting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.canvas.withValues(alpha: 0.98),
        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (metaLabel != null && metaLabel!.isNotEmpty)
                      Text(
                        metaLabel!,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    if (totalLabel != null && totalLabel!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        totalLabel!,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.brand,
                          height: 1,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: enabled && !submitting ? onConfirm : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    disabledBackgroundColor: AppColors.surfaceRaised,
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: submitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: AppColors.black,
                          ),
                        )
                      : Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              ctaLabel,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Icon(Icons.arrow_forward_rounded, size: 20),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
