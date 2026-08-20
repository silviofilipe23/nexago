import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../focus_section_header.dart';

/// "Ordem do seu dia": um card com uma linha por partida do atleta, seguidas
/// das fases que ainda vêm.
///
/// Colunas do protótipo: horário · marcador · fase e adversário · quadra ·
/// resultado. A linha da PRÓXIMA partida acende inteira — horário, marcador,
/// texto e nota — porque é a única que o atleta procura com pressa.
class FocusTimeline extends StatelessWidget {
  const FocusTimeline({
    super.key,
    required this.entries,
    required this.onOpen,
  });

  final List<TimelineEntry> entries;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
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
        isLast: i == entries.length - 1,
        onTap: entry.matchId != null && entry.clickable
            ? () => onOpen(entry.matchId!)
            : null,
      ));
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.outline),
        ),
        child: Column(children: rows),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.entry,
    required this.isLast,
    required this.onTap,
  });

  final TimelineEntry entry;
  final bool isLast;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isNext = entry.state == TimelineState.next;
    final isLive = entry.state == TimelineState.live;
    final accent = isLive ? AppColors.live : colors.brand;
    final highlight = isNext || isLive;
    final muted = entry.state == TimelineState.upcoming;

    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          border: Border(
            bottom: isLast
                ? BorderSide.none
                : BorderSide(color: colors.outline.withValues(alpha: 0.5)),
          ),
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.lg - 2,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 52,
              child: Text(
                entry.time ?? '—',
                style: AppTypography.monoMeta.copyWith(
                  color: highlight
                      ? accent
                      : muted
                          ? colors.onSurfaceMuted
                          : colors.onSurface,
                  fontWeight: highlight ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ),
            SizedBox(width: 24, child: _Mark(state: entry.state)),
            Expanded(
              child: Text(
                [entry.phaseLabel, ?_opponentPart()].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.bodyM.copyWith(
                  color: muted ? colors.onSurfaceMuted : colors.onSurface,
                  fontWeight: highlight ? FontWeight.w800 : FontWeight.w500,
                ),
              ),
            ),
            if (entry.courtLabel != null) ...[
              const SizedBox(width: AppSpacing.sm),
              Text(
                entry.courtLabel!,
                style: AppTypography.monoMeta.copyWith(
                  color: colors.onSurfaceMuted,
                  fontSize: 10,
                ),
              ),
            ],
            const SizedBox(width: AppSpacing.sm),
            SizedBox(
              width: 66,
              child: Text(
                _trailing(),
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.monoMeta.copyWith(
                  color: switch (entry.outcome) {
                    TimelineOutcome.win => colors.win,
                    TimelineOutcome.loss => colors.onSurfaceMuted,
                    null => highlight ? accent : colors.onSurfaceMuted,
                  },
                  fontWeight: highlight ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// "vs Sá / Toledo" nas partidas do atleta; o cruzamento cru nas linhas de
  /// fase, que não são um confronto dele.
  String? _opponentPart() {
    final name = entry.opponentName;
    if (name == null || name.trim().isEmpty) return null;
    return entry.matchId != null ? 'vs $name' : name;
  }

  /// Resultado quando houve, senão o que a linha decide.
  String _trailing() => entry.outcomeLabel ?? entry.note ?? '';
}

/// ✓ para encerrada, ponto cheio para ao vivo e para a próxima, anel vazado
/// para o que ainda vem.
class _Mark extends StatelessWidget {
  const _Mark({required this.state});

  final TimelineState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return switch (state) {
      TimelineState.done =>
        Icon(Icons.check_rounded, size: 15, color: colors.win),
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
    return Container(
      width: 13,
      height: 13,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: color.withValues(alpha: 0.35), width: 3),
      ),
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 1.5),
      ),
    );
  }
}
