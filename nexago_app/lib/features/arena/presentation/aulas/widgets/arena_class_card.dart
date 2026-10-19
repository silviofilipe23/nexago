import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import 'package:nexago_app/core/sports/sport_catalog.dart';
import '../../../domain/aulas/arena_class.dart';
import '../../../domain/aulas/arena_class_logic.dart';
import '../../widgets/arena_dashboard_tokens.dart';
import 'arena_class_atoms.dart';

/// Cartão de turma (A5, só leitura): horário, lotação com barra, professor e
/// quadra, e as datas que ficaram sem aula por quadra ocupada.
class ArenaClassCard extends StatelessWidget {
  const ArenaClassCard({super.key, required this.cls, required this.todayKey});

  final ArenaClass cls;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final teacherColor = arenaClassTeacherColor(cls.teacherColor);
    final ratio = cls.capacity > 0
        ? (cls.studentCount / cls.capacity).clamp(0.0, 1.0)
        : 0.0;
    final conflicts = arenaClassPendingConflicts(cls, todayKey);
    final sport = SportCatalog.labelOf(cls.sport);
    final details = [
      if (sport != null) sport,
      cls.level.label,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            cls.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        if (cls.type != ArenaClassType.turma) ...[
                          const SizedBox(width: 6),
                          ArenaClassTypeTag(type: cls.type),
                        ],
                        if (cls.isPaused) ...[
                          const SizedBox(width: 6),
                          const ArenaClassTag(
                            label: 'Pausada',
                            color: AppColors.pending,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      arenaClassScheduleLabel(cls),
                      style: TextStyle(
                        fontSize: 11.5,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                    if (details.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        details.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '${cls.studentCount}/${cls.capacity}',
                style: AppTypography.mono(
                  fontSize: 12,
                  color: cls.isFull ? AppColors.win : colors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 5,
              backgroundColor: colors.surfaceSheet,
              valueColor: AlwaysStoppedAnimation<Color>(
                cls.isFull ? AppColors.win : AppColors.brand,
              ),
            ),
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              ArenaClassTeacherDot(color: teacherColor),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  '${cls.teacherName} · ${cls.courtName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.onSurface.withValues(alpha: 0.72),
                  ),
                ),
              ),
              if (conflicts > 0)
                Text(
                  '$conflicts data${conflicts == 1 ? '' : 's'} sem quadra',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: AppColors.pending,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
