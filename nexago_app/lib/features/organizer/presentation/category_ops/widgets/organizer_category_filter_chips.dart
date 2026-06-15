import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/category_ops/category_ops_models.dart';
import '../../../domain/category_ops/category_ops_providers.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';

class OrganizerCategoryFilterChips extends ConsumerWidget {
  const OrganizerCategoryFilterChips({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(organizerCategoryFilterProvider);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: OrganizerCategoryTeamFilter.values.map((filter) {
          final selected = state.filter == filter;
          final label = switch (filter) {
            OrganizerCategoryTeamFilter.all => 'Todas',
            OrganizerCategoryTeamFilter.seeds => 'Cabeças',
            OrganizerCategoryTeamFilter.pending => 'Pendentes',
            OrganizerCategoryTeamFilter.waitlist => 'Lista de esp.',
          };
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(label),
              selected: selected,
              showCheckmark: false,
              onSelected: (_) => ref
                  .read(organizerCategoryFilterProvider.notifier)
                  .setFilter(filter),
              labelStyle: TextStyle(
                fontWeight: FontWeight.w700,
                color: selected
                    ? context.themeColors.onSurface
                    : context.themeColors.onSurfaceMuted,
              ),
              backgroundColor: context.themeColors.surfaceRaised,
              selectedColor: AppColors.brand.withValues(alpha: 0.18),
              side: BorderSide(
                color: selected
                    ? AppColors.brand.withValues(alpha: 0.5)
                    : Colors.transparent,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
