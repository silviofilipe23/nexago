import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_dashboard_period.dart';
import '../../domain/arena_dashboard_providers.dart';
import 'arena_dashboard_tokens.dart';

class ArenaDashboardPeriodChips extends ConsumerWidget {
  const ArenaDashboardPeriodChips({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(arenaDashboardPeriodProvider);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            for (final period in ArenaDashboardPeriod.values)
              Expanded(
                child: _PeriodChip(
                  label: period.label,
                  selected: selected == period,
                  onTap: () {
                    ref.read(arenaDashboardPeriodProvider.notifier).state =
                        period;
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : Colors.transparent,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: selected ? AppColors.black : AppColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
