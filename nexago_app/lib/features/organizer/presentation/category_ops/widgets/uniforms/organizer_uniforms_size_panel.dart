import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../domain/tournament_uniforms/tournament_uniforms_models.dart';

class OrganizerUniformsSizePanel extends StatelessWidget {
  const OrganizerUniformsSizePanel({
    super.key,
    required this.summary,
    required this.selectedSize,
    required this.pendingFilterActive,
    required this.onSizeSelected,
    required this.onPendingSelected,
    required this.onClearFilters,
  });

  final OrganizerUniformsSummary summary;
  final String? selectedSize;
  final bool pendingFilterActive;
  final ValueChanged<String> onSizeSelected;
  final VoidCallback onPendingSelected;
  final VoidCallback onClearFilters;

  bool get _hasSizeFilter =>
      selectedSize != null && selectedSize!.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final maxCount = summary.countBySize.values.fold<int>(
      0,
      (max, v) => v > max ? v : max,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'POR TAMANHO',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'toque p/ filtrar',
                        style: AppTypography.soraRegular(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_hasSizeFilter || pendingFilterActive)
                  TextButton(
                    onPressed: onClearFilters,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.brand,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      'limpar ×',
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final size in summary.sizeOrder) ...[
                  Expanded(
                    child: _SizeBar(
                      label: size,
                      count: summary.countBySize[size] ?? 0,
                      maxCount: maxCount,
                      selected: selectedSize == size,
                      onTap: () => onSizeSelected(size),
                    ),
                  ),
                  const SizedBox(width: 4),
                ],
                SizedBox(
                  width: 28,
                  child: _SizeBar(
                    label: '?',
                    count: summary.pendingWithoutSize,
                    maxCount: maxCount,
                    selected: pendingFilterActive,
                    onTap: onPendingSelected,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final size in summary.sizeOrder)
                  _SizeChip(
                    label: size,
                    count: summary.countBySize[size] ?? 0,
                    selected: selectedSize == size,
                    onTap: () => onSizeSelected(size),
                  ),
                _PendingChip(
                  count: summary.pendingWithoutSize,
                  selected: pendingFilterActive,
                  onTap: onPendingSelected,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SizeBar extends StatelessWidget {
  const _SizeBar({
    required this.label,
    required this.count,
    required this.maxCount,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final int maxCount;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ratio = maxCount <= 0 ? 0.0 : count / maxCount;
    final barHeight = 28.0 + (ratio * 36);

    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            height: barHeight,
            alignment: Alignment.bottomCenter,
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.35)
                  : AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(6),
              border: selected
                  ? Border.all(color: AppColors.brand, width: 1.5)
                  : null,
            ),
            child: Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '$count',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: selected ? AppColors.brand : context.themeColors.onSurface,
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _SizeChip extends StatelessWidget {
  const _SizeChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.brand.withValues(alpha: 0.16)
              : context.themeColors.canvas,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? AppColors.brand
                : AppColors.brand.withValues(alpha: 0.35),
          ),
        ),
        child: Text(
          '$label $count',
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: selected ? AppColors.brand : context.themeColors.onSurface,
          ),
        ),
      ),
    );
  }
}

class _PendingChip extends StatelessWidget {
  const _PendingChip({
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.pending.withValues(alpha: 0.12)
              : context.themeColors.canvas,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? AppColors.pending
                : AppColors.pending.withValues(alpha: 0.45),
            style: selected ? BorderStyle.solid : BorderStyle.solid,
          ),
        ),
        child: Text(
          'PEND. $count',
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.pending,
          ),
        ),
      ),
    );
  }
}
