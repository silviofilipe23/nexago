import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_discovery_labels.dart';
import '../../../domain/tournament_discovery_models.dart';

/// Chips de filtro por categoria + toggle "só com inscrição aberta" da lista
/// de descoberta.
class DiscoveryListFilterChips extends StatelessWidget {
  const DiscoveryListFilterChips({
    super.key,
    required this.category,
    required this.openOnly,
    required this.onCategoryChanged,
    required this.onOpenOnlyChanged,
  });

  final TournamentDiscoveryCategoryFilter category;
  final bool openOnly;
  final ValueChanged<TournamentDiscoveryCategoryFilter> onCategoryChanged;
  final ValueChanged<bool> onOpenOnlyChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: TournamentDiscoveryCategoryFilter.values.map((f) {
              final selected = category == f;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () => onCategoryChanged(f),
                    borderRadius: AppRadii.pillAll,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 9,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? context.themeColors.surfaceCard
                            : context.themeColors.surfaceRaised,
                        borderRadius: AppRadii.pillAll,
                        border: Border.all(
                          color: selected
                              ? context.themeColors.onSurfaceMuted
                                  .withValues(alpha: 0.45)
                              : context.themeColors.onSurfaceMuted
                                  .withValues(alpha: 0.2),
                        ),
                      ),
                      child: Text(
                        tournamentDiscoveryCategoryFilterLabel(f),
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: selected
                              ? context.themeColors.onSurface
                              : context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        SizedBox(height: 12),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onOpenOnlyChanged(!openOnly),
            borderRadius: AppRadii.smAll,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: openOnly
                            ? AppColors.brand
                            : context.themeColors.surfaceRaised,
                        borderRadius: AppRadii.smAll,
                        border: Border.all(
                          color: openOnly
                              ? AppColors.brand
                              : context.themeColors.onSurfaceMuted.withValues(
                                  alpha: 0.35,
                                ),
                          width: 1.5,
                        ),
                      ),
                      child: openOnly
                          ? Icon(
                              Icons.check_rounded,
                              size: 16,
                              color: AppColors.black,
                            )
                          : null,
                    ),
                  ),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Só com inscrição aberta',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
