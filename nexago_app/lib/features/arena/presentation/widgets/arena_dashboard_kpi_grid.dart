import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// Quatro KPIs em grade 2×2 (estilo SaaS).
class ArenaDashboardKpiGrid extends StatelessWidget {
  const ArenaDashboardKpiGrid({
    super.key,
    required this.items,
  });

  final List<ArenaDashboardKpiItem> items;

  @override
  Widget build(BuildContext context) {
    assert(items.length == 4);
    final theme = Theme.of(context);
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 16,
      crossAxisSpacing: 16,
      childAspectRatio: 1.42,
      children: items.map((e) => _KpiTile(item: e, theme: theme)).toList(),
    );
  }
}

class ArenaDashboardKpiItem {
  const ArenaDashboardKpiItem({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.item,
    required this.theme,
  });

  final ArenaDashboardKpiItem item;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.5);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(item.icon, color: AppColors.brand, size: 22),
            ),
            const Spacer(),
            Text(
              item.label.toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                color: muted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              item.value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.8,
                height: 1.05,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
