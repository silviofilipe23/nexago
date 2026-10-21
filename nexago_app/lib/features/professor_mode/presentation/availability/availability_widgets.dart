import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_availability.dart';

/// Peças da Disponibilidade (A10) e das particulares do aluno.

/// Cores da célula (protótipo `PR_SLOT`).
({Color bg, Color border, Color fg}) availabilityCellColors(
  AvailabilityCellState state,
  AppThemeColors colors,
) =>
    switch (state) {
      AvailabilityCellState.fixedClass => (
          bg: colors.onSurface.withValues(alpha: 0.08),
          border: colors.onSurface.withValues(alpha: 0.16),
          fg: colors.onSurface,
        ),
      AvailabilityCellState.open => (
          bg: AppColors.win.withValues(alpha: 0.12),
          border: AppColors.win.withValues(alpha: 0.35),
          fg: colors.readableTone(AppColors.win),
        ),
      AvailabilityCellState.booked => (
          bg: AppColors.brand.withValues(alpha: 0.16),
          border: AppColors.brand.withValues(alpha: 0.45),
          fg: colors.readableTone(AppColors.brandHover),
        ),
      AvailabilityCellState.blocked => (
          bg: AppColors.live.withValues(alpha: 0.06),
          border: AppColors.live.withValues(alpha: 0.30),
          fg: colors.readableTone(AppColors.live),
        ),
      AvailabilityCellState.closed => (
          bg: colors.surfaceCard,
          border: ProfessorLinksStyle.line(colors),
          fg: ProfessorLinksStyle.dim(colors),
        ),
    };

/// Uma hora da grade (toque abre/fecha; turma, particular e bloqueio só
/// mostram).
class AvailabilityCellTile extends StatelessWidget {
  const AvailabilityCellTile({super.key, required this.cell, this.onTap});

  final AvailabilityCell cell;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = availabilityCellColors(cell.state, colors);
    final content = Padding(
      padding: const EdgeInsets.fromLTRB(10, 7, 8, 7),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            cell.hourLabel,
            style: ProfessorLinksStyle.mono(
              12,
              weight: FontWeight.w700,
              color: c.fg,
            ),
          ),
          Text(
            cell.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(fontSize: 10, color: c.fg),
          ),
        ],
      ),
    );
    return Semantics(
      button: cell.toggleable,
      label: '${cell.hourLabel} ${cell.label}',
      child: Material(
        color: c.bg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: cell.toggleable ? onTap : null,
          child: SizedBox(
            height: 50,
            child: cell.state == AvailabilityCellState.blocked
                ? CustomPaint(
                    painter: _StripesPainter(c.border), child: content)
                : content,
          ),
        ),
      ),
    );
  }
}

/// Listras do bloqueio (o `repeating-linear-gradient` do desenho).
class _StripesPainter extends CustomPainter {
  const _StripesPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.18)
      ..strokeWidth = 4;
    for (double x = -size.height; x < size.width; x += 10) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_StripesPainter old) => old.color != color;
}

/// Legenda das cores da grade.
class AvailabilityLegend extends StatelessWidget {
  const AvailabilityLegend({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        for (final s in const [
          AvailabilityCellState.fixedClass,
          AvailabilityCellState.open,
          AvailabilityCellState.booked,
          AvailabilityCellState.blocked,
          AvailabilityCellState.closed,
        ])
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 11,
                height: 11,
                decoration: BoxDecoration(
                  color: availabilityCellColors(s, colors).bg,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(
                    color: availabilityCellColors(s, colors).border,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                availabilityCellStateLabel(s),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

/// Selo da situação da particular.
class PrivateLessonStatusTag extends StatelessWidget {
  const PrivateLessonStatusTag(this.status, {super.key});

  final PrivateLessonStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      PrivateLessonStatus.pending => AppColors.pending,
      PrivateLessonStatus.confirmed => AppColors.win,
      PrivateLessonStatus.declined ||
      PrivateLessonStatus.canceled =>
        AppColors.live,
    };
    return ArenaClassTag(
      label: privateLessonStatusLabel(status),
      color: color,
    );
  }
}

/// Card de uma particular: quem, quando, dupla, observação e as ações.
class PrivateLessonCard extends StatelessWidget {
  const PrivateLessonCard({
    super.key,
    required this.lesson,
    required this.title,
    required this.todayKey,
    this.showStatus = false,
    this.footer,
    this.actions = const [],
  });

  final PrivateLesson lesson;

  /// Nome do outro lado (aluno para o professor, professor para o aluno).
  final String title;
  final String todayKey;
  final bool showStatus;

  /// Linha extra (aviso de cancelamento fora do prazo…).
  final Widget? footer;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = lesson;
    return ProfessorLinksCard(
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
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        14.5,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${privateLessonWhenLabel(l.startAt, todayKey)} · '
                      '${availabilityDurationLabel(l.durationMin)}',
                      style: ProfessorLinksStyle.mono(
                        11,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
              ),
              if (l.pair) ...[
                const SizedBox(width: 8),
                const ArenaClassTag(
                  label: 'Em dupla',
                  color: ProfessorLinksStyle.blue,
                ),
              ],
              if (showStatus) ...[
                const SizedBox(width: 6),
                PrivateLessonStatusTag(l.status),
              ],
            ],
          ),
          if (l.note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '“${l.note}”',
              style: AppTypography.bodyS.copyWith(
                fontSize: 12,
                fontStyle: FontStyle.italic,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
          if (footer != null) ...[const SizedBox(height: 8), footer!],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: actions[i]),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Chip de opção (laranja quando escolhido), na altura dos seletores.
class AvailabilityChoiceChip extends StatelessWidget {
  const AvailabilityChoiceChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.brand : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(11),
          side: BorderSide(
            color: selected
                ? Colors.transparent
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            child: Text(
              label,
              style: ProfessorLinksStyle.mono(
                11,
                weight: FontWeight.w700,
                color: selected
                    ? ProfessorLinksStyle.onBrand
                    : ProfessorLinksStyle.mute(colors),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
