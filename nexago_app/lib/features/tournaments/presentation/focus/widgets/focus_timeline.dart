import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../focus_section_header.dart';

/// "Ordem do seu dia" — a timeline do atleta com trilho.
///
/// Segue o grid MOBILE do portal (`48px 20px minmax(0,1fr)`): hora, marca e
/// corpo na primeira linha, e o resultado/nota descendo para uma SEGUNDA linha
/// alinhada ao corpo. No desktop a web mantém tudo numa linha só, mas abaixo de
/// 640px ela quebra assim — que é o caso do app.
class FocusTimeline extends StatelessWidget {
  const FocusTimeline({
    super.key,
    required this.entries,
    required this.onOpen,
  });

  final List<TimelineEntry> entries;
  final ValueChanged<String> onOpen;

  static const double _timeWidth = 48;
  static const double _markWidth = 20;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];

    for (var i = 0; i < entries.length; i++) {
      final entry = entries[i];
      final firstWithoutTime =
          entry.time == null && (i == 0 || entries[i - 1].time != null);
      if (firstWithoutTime) {
        rows.add(const FocusSectionHeader(label: 'SEM HORÁRIO DEFINIDO'));
      }
      rows.add(_Row(
        entry: entry,
        onTap: entry.clickable ? () => onOpen(entry.matchId) : null,
      ));
    }

    return Column(children: rows);
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.entry, required this.onTap});

  final TimelineEntry entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isNext = entry.state == TimelineState.next;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenH,
          vertical: AppSpacing.md,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: FocusTimeline._timeWidth,
                  child: Text(
                    entry.time ?? '—',
                    style: AppTypography.monoMeta.copyWith(
                      color: isNext ? colors.brand : colors.onSurfaceMuted,
                    ),
                  ),
                ),
                SizedBox(
                  width: FocusTimeline._markWidth,
                  child: _Mark(state: entry.state),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.title,
                        style: AppTypography.bodyM.copyWith(
                          color: colors.onSurface,
                          fontWeight:
                              isNext ? FontWeight.w700 : FontWeight.w400,
                        ),
                      ),
                      if (entry.detail != null && entry.detail!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            entry.detail!,
                            style: AppTypography.bodyS
                                .copyWith(color: colors.onSurfaceMuted),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            // Segunda linha, alinhada ao corpo — `grid-column: 3` do portal.
            if (entry.outcomeLabel != null || entry.note != null)
              Padding(
                padding: const EdgeInsets.only(
                  left: FocusTimeline._timeWidth + FocusTimeline._markWidth,
                  top: AppSpacing.xs,
                ),
                child: entry.outcomeLabel != null
                    ? Text(
                        entry.outcomeLabel!,
                        style: AppTypography.monoMeta.copyWith(
                          color: entry.outcome == TimelineOutcome.win
                              ? colors.win
                              : colors.onSurfaceMuted,
                        ),
                      )
                    : Text(
                        entry.note!,
                        style:
                            AppTypography.bodyS.copyWith(color: colors.brand),
                      ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A marca do trilho: ✓ para encerrada, ponto cheio para ao vivo e para a
/// próxima, anel vazado para o resto.
class _Mark extends StatelessWidget {
  const _Mark({required this.state});

  final TimelineState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return switch (state) {
      TimelineState.done => Icon(
          Icons.check_rounded,
          size: 14,
          color: colors.onSurfaceMuted,
        ),
      TimelineState.live => const _Dot(color: AppColors.live),
      TimelineState.next => _Dot(color: colors.brand),
      TimelineState.upcoming => _Ring(color: colors.outline),
    };
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 5),
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 5),
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: color, width: 1.5),
        ),
      ),
    );
  }
}
