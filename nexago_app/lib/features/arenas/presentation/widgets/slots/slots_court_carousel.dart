import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/arena_list_item.dart';
import '../../../domain/arena_detail_logic.dart';
import '../../../domain/slots_page_providers.dart';

class SlotsCourtCarousel extends StatelessWidget {
  const SlotsCourtCarousel({
    super.key,
    required this.arena,
    required this.summaries,
    required this.selectedCourtId,
    required this.onSelected,
    this.loading = false,
  });

  final ArenaListItem arena;
  final List<SlotsCourtSummary> summaries;
  final String selectedCourtId;
  final ValueChanged<String> onSelected;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text(
            'QUADRA',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
        if (loading)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(
                color: AppColors.brand,
                strokeWidth: 2,
              ),
            ),
          )
        else if (summaries.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Text(
              'Nenhuma quadra disponível.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
        else
          SizedBox(
            height: 88,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: summaries.length,
              separatorBuilder: (_, __) => SizedBox(width: 10),
              itemBuilder: (context, index) {
                final item = summaries[index];
                final court = item.court;
                final isSelected = court.id == selectedCourtId;
                final surface = courtSurfaceBadgeLabel(arena, court);

                final String subtitle;
                if (court.isMaintenance) {
                  subtitle = 'Manutenção';
                } else if (item.hasFreeSlots) {
                  final n = item.freeSlotsCount;
                  subtitle =
                      '$n horário${n == 1 ? '' : 's'} livre${n == 1 ? '' : 's'}';
                } else {
                  subtitle = 'Lotada';
                }

                return Material(
                  color: context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(14),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => onSelected(court.id),
                    child: Container(
                      width: 148,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isSelected
                              ? AppColors.brand
                              : context.themeColors.surfaceRaised,
                          width: isSelected ? 2 : 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            court.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                          SizedBox(height: 6),
                          Row(
                            children: [
                              if (surface != null) ...[
                                _Badge(label: surface),
                                SizedBox(width: 4),
                              ],
                            ],
                          ),
                          Spacer(),
                          Text(
                            subtitle,
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: item.hasFreeSlots && !court.isMaintenance
                                  ? AppColors.brand
                                  : context.themeColors.onSurfaceMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.4,
            ),
      ),
    );
  }
}
