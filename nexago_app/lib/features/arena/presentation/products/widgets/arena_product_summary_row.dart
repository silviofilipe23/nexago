import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/products/arena_product_logic.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaProductSummaryRow extends StatelessWidget {
  const ArenaProductSummaryRow({super.key, required this.summary});

  final ArenaProductSummary summary;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _SummaryTile(
              value: '${summary.activeCount}',
              label: 'ATIVOS',
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _SummaryTile(
              value: '${summary.lowCount}',
              label: 'BAIXO',
              valueColor: summary.lowCount > 0 ? AppColors.pending : null,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _SummaryTile(
              value: '${summary.outCount}',
              label: 'ESGOT.',
              valueColor: summary.outCount > 0 ? AppColors.live : null,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: _SummaryTile(
              value: formatInventoryValueReais(summary.inventoryValueCents),
              label: 'EM ESTOQUE',
              compactValue: true,
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.value,
    required this.label,
    this.valueColor,
    this.compactValue = false,
  });

  final String value;
  final String label;
  final Color? valueColor;
  final bool compactValue;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            height: 22,
            child: Align(
              alignment: Alignment.bottomLeft,
              child: Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  color: valueColor ?? context.themeColors.onSurface,
                  fontSize: compactValue ? 13 : 18,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 11,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.8,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}
