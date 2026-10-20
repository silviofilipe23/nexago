import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/aulas/arena_class_payout_logic.dart';

// Peças das telas de repasse do professor (fase 2b).

/// Cor da situação do professor no mês (mesmos tons do portal).
Color arenaClassPayoutStateColor(
  BuildContext context,
  ArenaClassPayoutState state,
) =>
    switch (state) {
      ArenaClassPayoutState.noModel => AppColors.pending,
      ArenaClassPayoutState.partial => context.themeColors.onSurfaceMuted,
      ArenaClassPayoutState.toClose => AppColors.pending,
      ArenaClassPayoutState.closed => AppColors.brand,
      ArenaClassPayoutState.paid => AppColors.win,
    };

/// ‹ outubro de 2026 › — o próximo para no mês corrente.
class ArenaClassMonthNav extends StatelessWidget {
  const ArenaClassMonthNav({
    super.key,
    required this.month,
    required this.currentMonth,
    required this.onChanged,
  });

  /// `YYYY-MM`.
  final String month;
  final String currentMonth;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final canNext = month.compareTo(currentMonth) < 0;
    Widget arrow(IconData icon, String label, VoidCallback? onTap) => Material(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(
                icon,
                size: 20,
                semanticLabel: label,
                color: onTap == null
                    ? colors.onSurfaceMuted.withValues(alpha: 0.35)
                    : colors.onSurface,
              ),
            ),
          ),
        );
    return Row(
      children: [
        arrow(
          Icons.chevron_left_rounded,
          'Mês anterior',
          () => onChanged(arenaClassShiftMonth(month, -1)),
        ),
        Expanded(
          child: Text(
            arenaClassMonthLongLabel(month),
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
          ),
        ),
        arrow(
          Icons.chevron_right_rounded,
          'Próximo mês',
          canNext ? () => onChanged(arenaClassShiftMonth(month, 1)) : null,
        ),
      ],
    );
  }
}

/// Faixa de aviso ("Mês em andamento — valores parciais").
class ArenaClassInfoBanner extends StatelessWidget {
  const ArenaClassInfoBanner(this.message, {super.key, this.warn = false});

  final String message;

  /// Amarelo (mudou desde o fechamento, chamada aberta).
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = warn ? colors.pending : colors.onSurfaceMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: warn
            ? AppColors.pending.withValues(alpha: 0.08)
            : colors.surfaceRaised,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: warn
              ? AppColors.pending.withValues(alpha: 0.4)
              : colors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            warn ? Icons.warning_amber_rounded : Icons.info_outline_rounded,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12, height: 1.4, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Coluna "rótulo / valor" das faixas de números (hero e cartões).
class ArenaClassPayoutStat extends StatelessWidget {
  const ArenaClassPayoutStat({
    super.key,
    required this.label,
    required this.value,
    this.color,
    this.sub,
  });

  final String label;
  final String value;
  final Color? color;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 10.5, color: colors.onSurfaceMuted),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: colors.readableTone(color ?? colors.onSurface),
            ),
          ),
        ),
        if (sub != null && sub!.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            sub!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10, color: colors.onSurfaceMuted),
          ),
        ],
      ],
    );
  }
}

/// Faixa de até 3 [ArenaClassPayoutStat] separados por linha fina.
class ArenaClassPayoutStatRow extends StatelessWidget {
  const ArenaClassPayoutStatRow({super.key, required this.stats});

  final List<Widget> stats;

  @override
  Widget build(BuildContext context) {
    final line = context.themeColors.onSurface.withValues(alpha: 0.08);
    return Container(
      padding: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: line))),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < stats.length; i++)
              Expanded(
                child: Container(
                  padding: EdgeInsets.only(left: i == 0 ? 0 : 12),
                  decoration: i == 0
                      ? null
                      : BoxDecoration(
                          border: Border(left: BorderSide(color: line)),
                        ),
                  child: stats[i],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
