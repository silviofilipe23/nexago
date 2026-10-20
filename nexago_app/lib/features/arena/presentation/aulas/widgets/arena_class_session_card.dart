import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/aulas/arena_class_logic.dart';
import '../../../domain/aulas/arena_class_session.dart';
import 'arena_class_atoms.dart';

/// Cartão de uma aula do dia (A1): horário à esquerda, faixa na cor do
/// professor, "AGORA" quando ao vivo e esmaecido quando concluída/cancelada.
class ArenaClassSessionCard extends StatelessWidget {
  const ArenaClassSessionCard({super.key, required this.item, this.onTap});

  final ArenaClassDayItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = item.session;
    final live = item.phase == ArenaClassPhase.live;
    final dimmed = item.phase == ArenaClassPhase.done ||
        item.phase == ArenaClassPhase.canceled;
    final teacherColor = arenaClassTeacherColor(s.teacherColor);
    final teacherFirstName = s.teacherName.trim().split(RegExp(r'\s+')).first;
    final note = _note(item);

    return Opacity(
      opacity: dimmed ? 0.55 : 1,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 46,
            child: Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.startTime,
                    style: AppTypography.mono(
                      fontSize: 13,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    s.endTime,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Material(
              color: live
                  ? AppColors.live.withValues(alpha: 0.07)
                  : colors.surfaceCard,
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: live
                          ? AppColors.live.withValues(alpha: 0.3)
                          : colors.onSurfaceMuted.withValues(alpha: 0.12),
                    ),
                  ),
                  child: IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(width: 3, color: teacherColor),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(11, 12, 13, 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    ArenaClassTypeTag(type: s.type),
                                    if (live) ...[
                                      const SizedBox(width: 6),
                                      const _LiveBadge(),
                                    ] else if (item.isNext) ...[
                                      const SizedBox(width: 6),
                                      const ArenaClassTag(
                                        label: 'Próxima',
                                        color: AppColors.brand,
                                      ),
                                    ] else if (item.phase ==
                                        ArenaClassPhase.canceled) ...[
                                      const SizedBox(width: 6),
                                      const ArenaClassTag(
                                        label: 'Cancelada',
                                        color: AppColors.live,
                                      ),
                                    ],
                                    const Spacer(),
                                    Text(
                                      _countLabel(item),
                                      style: AppTypography.mono(
                                        fontSize: 11,
                                        color: colors.onSurface,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 7),
                                Text(
                                  s.className,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.soraRegular(
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w700,
                                    color: colors.onSurface,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    ArenaClassTeacherDot(color: teacherColor),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        '$teacherFirstName · ${s.courtName}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: colors.onSurfaceMuted,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (note != null) ...[
                                  const SizedBox(height: 7),
                                  Text(
                                    note.$1,
                                    style: AppTypography.mono(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      color: colors.readableTone(note.$2),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// "11 alunos" antes de começar; "presentes/alunos" depois.
  static String _countLabel(ArenaClassDayItem item) {
    final total = item.studentCount;
    if (item.phase == ArenaClassPhase.upcoming ||
        item.phase == ArenaClassPhase.canceled) {
      return '$total aluno${total == 1 ? '' : 's'}';
    }
    return '${item.session.presentCount}/$total';
  }

  static (String, Color)? _note(ArenaClassDayItem item) {
    final s = item.session;
    if (item.phase == ArenaClassPhase.canceled) {
      final reason = s.cancelReason;
      return (
        reason == null || reason == ArenaClassCancelReason.other
            ? 'Quadra liberada'
            : 'Cancelada · ${reason.label.toLowerCase()}',
        AppColors.live,
      );
    }
    if (s.isCompleted) return ('Chamada fechada', AppColors.win);
    if (item.attendancePending) return ('Chamada pendente', AppColors.pending);
    return null;
  }
}

class _LiveBadge extends StatelessWidget {
  const _LiveBadge();

  @override
  Widget build(BuildContext context) {
    final live = context.themeColors.live;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            color: live,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 5),
        Text(
          'AGORA',
          style: AppTypography.mono(
            fontSize: 9,
            color: live,
            letterSpacing: 0.9,
          ),
        ),
      ],
    );
  }
}
