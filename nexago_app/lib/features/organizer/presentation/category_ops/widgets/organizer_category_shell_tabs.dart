import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';

class OrganizerCategoryShellTabs extends StatelessWidget {
  const OrganizerCategoryShellTabs({
    super.key,
    required this.selected,
    required this.onSelected,
    required this.teamCount,
    required this.pendingPaymentsCount,
  });

  final OrganizerCategoryShellTab selected;
  final ValueChanged<OrganizerCategoryShellTab> onSelected;
  final int teamCount;
  final int pendingPaymentsCount;

  int? _badgeCount(OrganizerCategoryShellTab tab) => switch (tab) {
        OrganizerCategoryShellTab.payments when pendingPaymentsCount > 0 =>
          pendingPaymentsCount,
        _ => null,
      };

  String _label(OrganizerCategoryShellTab tab) => switch (tab) {
        OrganizerCategoryShellTab.teams =>
          categoryShellTabLabel(tab, count: teamCount),
        OrganizerCategoryShellTab.payments => 'Pagamentos',
        OrganizerCategoryShellTab.bracket => 'Chave',
        OrganizerCategoryShellTab.matches => 'Jogos',
      };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: OrganizerCategoryShellTab.values.map((tab) {
            final isSelected = tab == selected;
            final badge = _badgeCount(tab);
            return Expanded(
              child: GestureDetector(
                onTap: () => onSelected(tab),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.brand : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          _label(tab),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: isSelected
                                ? AppColors.black
                                : context.themeColors.onSurfaceMuted,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ),
                      if (badge != null) ...[
                        const SizedBox(width: 4),
                        Container(
                          width: 16,
                          height: 16,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AppColors.black.withValues(alpha: 0.15)
                                : AppColors.brand.withValues(alpha: 0.2),
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '$badge',
                            style: AppTypography.mono(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: isSelected
                                  ? AppColors.black
                                  : AppColors.brand,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}
