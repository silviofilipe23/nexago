import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/aulas/arena_class_logic.dart';
import '../../../domain/aulas/arena_class_session.dart';

/// Peças da chamada compartilhadas pela chamada da arena
/// (`arena_class_attendance_page.dart`) e pela do professor da aula
/// (`TeacherClassAttendancePage`, vínculo com "Gerenciar as próprias aulas").

class ArenaClassAttendanceSummaryCard extends StatelessWidget {
  const ArenaClassAttendanceSummaryCard({
    required this.summary,
    required this.onAllPresent,
    required this.allPresentLabel,
    required this.onAddExtra,
  });

  final AttendanceSummary summary;
  final VoidCallback? onAllPresent;
  final String allPresentLabel;

  /// "Encaixar aluno" (A3); `null` esconde.
  final VoidCallback? onAddExtra;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.6],
          colors: [
            AppColors.brand.withValues(alpha: 0.18),
            colors.surfaceCard,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PRESENTES',
                      style: AppTypography.mono(
                        fontSize: 9.5,
                        letterSpacing: 1.5,
                        color: AppColors.brandHover,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text.rich(
                      TextSpan(
                        text: '${summary.present}',
                        style: AppTypography.soraRegular(
                          fontSize: 40,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                          letterSpacing: -1.5,
                          height: 1,
                        ),
                        children: [
                          TextSpan(
                            text: '/${summary.total}',
                            style: AppTypography.soraRegular(
                              fontSize: 20,
                              color: colors.onSurfaceMuted,
                              letterSpacing: 0,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _count(
                    '${summary.absent} falta${summary.absent == 1 ? '' : 's'}',
                    AppColors.live,
                  ),
                  const SizedBox(height: 4),
                  _count('${summary.excused} avisou', AppColors.pending),
                  const SizedBox(height: 4),
                  _count(
                    '${summary.unmarked} sem marcar',
                    colors.onSurfaceMuted,
                  ),
                ],
              ),
            ],
          ),
          if (onAllPresent != null || onAddExtra != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                if (onAddExtra != null)
                  Expanded(
                    child: _ghost(
                      colors,
                      icon: Icons.add_rounded,
                      label: 'Encaixar aluno',
                      onPressed: onAddExtra,
                    ),
                  ),
                if (onAddExtra != null && onAllPresent != null)
                  const SizedBox(width: 8),
                if (onAllPresent != null)
                  Expanded(
                    child: _ghost(
                      colors,
                      icon: Icons.done_all_rounded,
                      label: allPresentLabel,
                      onPressed: onAllPresent,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _ghost(
    AppThemeColors colors, {
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
  }) =>
      SizedBox(
        height: 38,
        child: OutlinedButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: 16),
          label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
          style: OutlinedButton.styleFrom(
            foregroundColor: colors.onSurface,
            backgroundColor: colors.surfaceRaised,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            side: BorderSide(
              color: colors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: AppTypography.soraRegular(fontSize: 12.5),
          ),
        ),
      );

  Widget _count(String text, Color color) => Text(
        text,
        style: AppTypography.mono(
          fontSize: 10.5,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      );
}

class ArenaClassAttendanceNotice extends StatelessWidget {
  const ArenaClassAttendanceNotice(
      {required this.color, required this.icon, required this.text});

  final Color color;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Sem marca: dois botões (falta ✗ e presente ✓). Com marca: a etiqueta, que
/// abre o menu para trocar (inclusive "Avisou") ou limpar.
class ArenaClassMarkControl extends StatelessWidget {
  const ArenaClassMarkControl({
    required this.name,
    required this.mark,
    required this.onMark,
  });

  final String name;
  final AttendanceMark? mark;
  final ValueChanged<AttendanceMark?>? onMark;

  static Color colorOf(AttendanceMark mark) => switch (mark) {
        AttendanceMark.present => AppColors.win,
        AttendanceMark.absent => AppColors.live,
        AttendanceMark.excused => AppColors.pending,
      };

  @override
  Widget build(BuildContext context) {
    final current = mark;
    final colors = context.themeColors;
    if (current == null) {
      if (onMark == null) {
        return Text(
          '—',
          style: AppTypography.mono(color: colors.onSurfaceMuted),
        );
      }
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SquareButton(
            icon: Icons.close_rounded,
            semanticLabel: 'Marcar falta de $name',
            onTap: () => onMark!(AttendanceMark.absent),
          ),
          const SizedBox(width: 6),
          _SquareButton(
            icon: Icons.check_rounded,
            semanticLabel: 'Marcar presença de $name',
            onTap: () => onMark!(AttendanceMark.present),
          ),
        ],
      );
    }

    final color = colorOf(current);
    final pill = Container(
      height: 40,
      constraints: const BoxConstraints(minWidth: 92),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (current == AttendanceMark.present)
            Icon(Icons.check_rounded, size: 15, color: color)
          else if (current == AttendanceMark.absent)
            Icon(Icons.close_rounded, size: 15, color: color),
          if (current != AttendanceMark.excused) const SizedBox(width: 6),
          Text(
            current.label,
            style: AppTypography.soraRegular(fontSize: 12.5, color: color),
          ),
        ],
      ),
    );
    if (onMark == null) return pill;
    return PopupMenuButton<_MarkChoice>(
      tooltip: 'Trocar marca de $name',
      color: colors.surfaceSheet,
      position: PopupMenuPosition.under,
      onSelected: (choice) => onMark!(choice.mark),
      itemBuilder: (_) => [
        for (final m in AttendanceMark.values)
          if (m != current)
            PopupMenuItem(
              value: _MarkChoice(m),
              child: Text(m.label, style: TextStyle(color: colorOf(m))),
            ),
        const PopupMenuItem(
          value: _MarkChoice(null),
          child: Text('Limpar marca'),
        ),
      ],
      child: pill,
    );
  }
}

/// Embrulho para o `PopupMenuButton` distinguir "limpar" (null) de nada
/// escolhido.
class _MarkChoice {
  const _MarkChoice(this.mark);

  final AttendanceMark? mark;
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({
    required this.icon,
    required this.semanticLabel,
    required this.onTap,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: colors.onSurfaceMuted.withValues(alpha: 0.25),
              ),
            ),
            child: Icon(icon, size: 17, color: colors.onSurfaceMuted),
          ),
        ),
      ),
    );
  }
}

class ArenaClassAttendanceFooter extends StatelessWidget {
  const ArenaClassAttendanceFooter({
    required this.label,
    required this.saving,
    required this.onPressed,
  });

  final String label;
  final bool saving;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurface.withValues(alpha: 0.06),
          ),
        ),
      ),
      child: SizedBox(
        height: 50,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: saving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.black,
                  ),
                )
              : Text(label, style: AppTypography.soraRegular(fontSize: 15)),
        ),
      ),
    );
  }
}
