import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/comandas/arena_comanda_logic.dart';
import '../../../domain/comandas/arena_comanda_providers.dart';

class ArenaComandaFilterChips extends ConsumerWidget {
  const ArenaComandaFilterChips({
    super.key,
    required this.openCount,
  });

  final int openCount;

  static const _chips = ArenaComandaFilterChip.values;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(arenaComandaFilterProvider);

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final chip in _chips) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(
                  comandaFilterChipLabel(
                    chip,
                    count: chip == ArenaComandaFilterChip.all ? openCount : 0,
                  ),
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: selected == chip
                        ? AppColors.black
                        : context.themeColors.onSurface,
                  ),
                ),
                selected: selected == chip,
                onSelected: (_) {
                  ref.read(arenaComandaFilterProvider.notifier).state = chip;
                },
                showCheckmark: false,
                selectedColor: AppColors.brand,
                backgroundColor: context.themeColors.surfaceRaised,
                side: BorderSide(
                  color: selected == chip
                      ? AppColors.brand
                      : context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.15,
                        ),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
                labelStyle: AppTypography.mono(fontSize: 12),
                padding: const EdgeInsets.symmetric(horizontal: 4),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
