import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';

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
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: OrganizerCategoryTeamFilter.values.map((filter) {
          final selected = state.filter == filter;
          final label = switch (filter) {
            OrganizerCategoryTeamFilter.all => 'Todas',
            OrganizerCategoryTeamFilter.seeds => 'Cabeças',
            OrganizerCategoryTeamFilter.pending => 'Pendentes',
            OrganizerCategoryTeamFilter.waitlist => 'Fila',
          };
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(label),
              selected: selected,
              onSelected: (_) =>
                  ref.read(organizerCategoryFilterProvider.notifier).setFilter(filter),
              selectedColor: AppColors.brand.withValues(alpha: 0.2),
              checkmarkColor: AppColors.brand,
            ),
          );
        }).toList(),
      ),
    );
  }
}
