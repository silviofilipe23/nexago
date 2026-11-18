import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_business_providers.dart';
import '../../domain/arena_idle_map.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_staff_role.dart';
import 'arena_dashboard_tokens.dart';
import 'arena_promotion_form_sheet.dart';

/// "Onde sobra horário": ocupação dos próximos 7 dias por hora, com o maior
/// bloco vazio sugerido para promoção.
class ArenaIdleMapCard extends ConsumerWidget {
  const ArenaIdleMapCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final map = ref.watch(arenaIdleMapProvider).valueOrNull;
    if (map == null) return const SizedBox.shrink();

    final colors = context.themeColors;
    final theme = Theme.of(context);
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final canPromote = ref.watch(arenaCanWriteProvider(ArenaArea.promocoes));
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Onde sobra horário',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  'próximos 7 dias',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (map.isEmpty)
              Text(
                'Sem horários abertos na grade desta semana.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              )
            else ...[
              _Heatmap(map: map),
              const SizedBox(height: 8),
              const _Legend(),
            ],
            if (map.hole != null) ...[
              const SizedBox(height: 14),
              _HoleSuggestion(
                hole: map.hole!,
                seesMoney: seesMoney,
                onPromote: canPromote && arenaId.isNotEmpty
                    ? () => ArenaPromotionFormSheet.show(
                        context,
                        arenaId: arenaId,
                        draft: arenaIdleHoleDraft(map.hole!),
                      )
                    : null,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Promoção sugerida para o bloco vazio: o dia da semana e o horário dele.
ArenaPromotionDraft arenaIdleHoleDraft(ArenaIdleHole hole) {
  String hm(int h) => '${h.toString().padLeft(2, '0')}:00';
  final weekday = DateFormat.EEEE('pt_BR').format(hole.date);
  return ArenaPromotionDraft(
    label: 'Horário vazio de $weekday',
    weekdays: {hole.date.weekday},
    startTime: hm(hole.startHour),
    endTime: hm(hole.endHour),
  );
}

class _Heatmap extends StatelessWidget {
  const _Heatmap({required this.map});

  final ArenaIdleMap map;

  static const double _labelWidth = 34;
  static const double _gap = 2;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final small = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: colors.onSurfaceMuted,
      fontSize: 10,
    );
    final hole = map.hole;

    return LayoutBuilder(
      builder: (context, c) {
        final n = map.hours.length;
        final cell = ((c.maxWidth - _labelWidth) / n) - _gap;
        final cellH = cell.clamp(10.0, 18.0);
        // Rótulo de hora a cada 3 colunas, para não encavalar.
        final step = n <= 8 ? 1 : (n <= 14 ? 2 : 3);

        return Column(
          children: [
            Row(
              children: [
                const SizedBox(width: _labelWidth),
                for (var i = 0; i < n; i++)
                  SizedBox(
                    width: cell + _gap,
                    child: Text(
                      i % step == 0 ? '${map.hours[i]}h' : '',
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.visible,
                      softWrap: false,
                      style: small,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            for (final day in map.days)
              Padding(
                padding: const EdgeInsets.only(bottom: _gap),
                child: Row(
                  children: [
                    SizedBox(
                      width: _labelWidth,
                      child: Text(
                        DateFormat.E(
                          'pt_BR',
                        ).format(day.date).replaceAll('.', ''),
                        style: small,
                      ),
                    ),
                    for (final c in day.cells)
                      Padding(
                        padding: const EdgeInsets.only(right: _gap),
                        child: _Cell(
                          cell: c,
                          width: cell,
                          height: cellH,
                          inHole:
                              hole != null &&
                              hole.date == day.date &&
                              c.hour >= hole.startHour &&
                              c.hour < hole.endHour,
                        ),
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.cell,
    required this.width,
    required this.height,
    required this.inHole,
  });

  final ArenaIdleMapCell cell;
  final double width;
  final double height;
  final bool inHole;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final occ = cell.occupancy;
    final Color fill;
    if (occ == null) {
      fill = Colors.transparent;
    } else if (cell.isPast) {
      fill = colors.onSurfaceMuted.withValues(alpha: 0.10);
    } else if (occ == 0) {
      fill = colors.onSurfaceMuted.withValues(alpha: 0.14);
    } else {
      fill = AppColors.brand.withValues(alpha: 0.18 + occ * 0.82);
    }
    return Tooltip(
      message: occ == null
          ? 'Fechado'
          : '${cell.hour}h · ${cell.booked} de ${cell.total} reservados',
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(3),
          border: inHole
              ? Border.all(color: colors.brandText, width: 1.5)
              : occ == null
              ? Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.10))
              : null,
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final small = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: colors.onSurfaceMuted,
      fontSize: 10,
    );
    Widget swatch(Color c) => Container(
      width: 12,
      height: 10,
      margin: const EdgeInsets.symmetric(horizontal: 1),
      decoration: BoxDecoration(
        color: c,
        borderRadius: BorderRadius.circular(2),
      ),
    );
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('vazio ', style: small),
        swatch(colors.onSurfaceMuted.withValues(alpha: 0.14)),
        for (final a in [0.3, 0.6, 1.0])
          swatch(AppColors.brand.withValues(alpha: 0.18 + a * 0.82)),
        Text(' cheio', style: small),
      ],
    );
  }
}

class _HoleSuggestion extends StatelessWidget {
  const _HoleSuggestion({
    required this.hole,
    required this.seesMoney,
    this.onPromote,
  });

  final ArenaIdleHole hole;
  final bool seesMoney;
  final VoidCallback? onPromote;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final day = DateFormat("EEEE, d/MM", 'pt_BR').format(hole.date);
    final title =
        '${day[0].toUpperCase()}${day.substring(1)}, '
        '${hole.startHour}h–${hole.endHour}h está vazio';
    final detail = [
      '${hole.freeSlots} horários livres',
      if (seesMoney && hole.idleReais > 0)
        '~${formatBRLWhole(hole.idleReais)} parados',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            detail,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
            ),
          ),
          if (onPromote != null)
            TextButton(
              onPressed: onPromote,
              style: TextButton.styleFrom(
                foregroundColor: colors.brandText,
                padding: EdgeInsets.zero,
                minimumSize: const Size(0, 36),
              ),
              child: const Text('Criar promoção para esse horário ›'),
            )
          else
            const SizedBox(height: 4),
        ],
      ),
    );
  }
}
