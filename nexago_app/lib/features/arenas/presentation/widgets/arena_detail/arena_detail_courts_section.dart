import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_detail_logic.dart';
import '../../../domain/arena_list_item.dart';
import 'arena_detail_court_card.dart';

/// Seção "Quadras" do perfil público da arena.
///
/// Todas as quadras num cartão só (linhas com divisória). Com mais de
/// [kArenaDetailCourtsCollapsedCount] quadras começa retraída — as primeiras (com horário hoje
/// vêm antes) e "Ver todas as N quadras" — e, havendo mais de um esporte, ganha filtros por
/// esporte em cima.
class ArenaDetailCourtsSection extends StatefulWidget {
  const ArenaDetailCourtsSection({
    super.key,
    required this.arena,
    required this.today,
    required this.loading,
    required this.onOpenCourt,
  });

  final ArenaListItem arena;
  final ArenaDetailTodaySummary? today;
  final bool loading;
  final ValueChanged<String> onOpenCourt;

  @override
  State<ArenaDetailCourtsSection> createState() =>
      _ArenaDetailCourtsSectionState();
}

class _ArenaDetailCourtsSectionState extends State<ArenaDetailCourtsSection> {
  bool _expanded = false;
  String? _sport;

  void _pickSport(String? sport) {
    setState(() {
      _sport = sport;
      _expanded = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final today = widget.today;
    final courts = today?.courts ?? const <ArenaCourtDaySummary>[];

    final header = Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Text(
            'Quadras',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
              letterSpacing: -0.3,
            ),
          ),
        ),
        if (courts.isNotEmpty) _Summary(today: today!),
      ],
    );

    final Widget body;
    if (widget.loading && today == null) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    } else if (courts.isEmpty) {
      body = Text(
        'Nenhuma quadra cadastrada ainda.',
        style: theme.textTheme.bodyMedium?.copyWith(
          color: colors.onSurfaceMuted,
        ),
      );
    } else {
      body = _buildList(context, courts);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        const SizedBox(height: 12),
        body,
      ],
    );
  }

  Widget _buildList(BuildContext context, List<ArenaCourtDaySummary> courts) {
    final colors = context.themeColors;
    final filters = courtSportFilterOptions(courts);
    // Filtro some se a arena mudou e o esporte escolhido deixou de existir.
    final sport = filters.any((f) => f.label == _sport) ? _sport : null;
    final visibleAll = filterCourtsBySport(courts, sport);
    final collapsible = visibleAll.length > kArenaDetailCourtsCollapsedCount;
    final visible = collapsible && !_expanded
        ? visibleAll.take(kArenaDetailCourtsCollapsedCount).toList()
        : visibleAll;
    final hidden = visibleAll.length - visible.length;
    final divider = Divider(
        height: 1, thickness: 1, color: colors.outline.withValues(alpha: 0.35));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (filters.isNotEmpty) ...[
          SizedBox(
            height: 36,
            // Poucos chips: todos montados (Row), rolando na horizontal se não couberem.
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              clipBehavior: Clip.none,
              child: Row(
                children: [
                  _SportChip(
                    label: 'Todas',
                    count: courts.length,
                    selected: sport == null,
                    onTap: () => _pickSport(null),
                  ),
                  for (final f in filters) ...[
                    const SizedBox(width: 8),
                    _SportChip(
                      label: f.label,
                      count: f.count,
                      selected: sport == f.label,
                      onTap: () =>
                          _pickSport(sport == f.label ? null : f.label),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        Material(
          color: colors.surfaceCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
          ),
          clipBehavior: Clip.antiAlias,
          child: AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: const Cubic(0.22, 1, 0.36, 1),
            alignment: Alignment.topCenter,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < visible.length; i++) ...[
                  if (i > 0) divider,
                  ArenaDetailCourtCard(
                    key: ValueKey(visible[i].court.id),
                    arena: widget.arena,
                    summary: visible[i],
                    arenaFallbackPricePerHour: widget.arena.pricePerHourReais,
                    onTap: () => widget.onOpenCourt(visible[i].court.id),
                  ),
                ],
                if (collapsible) ...[
                  divider,
                  _ExpandButton(
                    expanded: _expanded,
                    total: visibleAll.length,
                    hidden: hidden,
                    onTap: () => setState(() => _expanded = !_expanded),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.today});

  final ArenaDetailTodaySummary today;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final total = today.courts.length;
    final free = today.freeCourtsToday;
    final base = AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.1,
      color: colors.onSurfaceMuted,
    );
    return Text.rich(
      TextSpan(
        text: '$total ${total == 1 ? 'QUADRA' : 'QUADRAS'}',
        children: [
          if (free > 0) ...[
            const TextSpan(text: ' · '),
            TextSpan(
              text: '$free COM HORÁRIO HOJE',
              style: base.copyWith(
                color: colors.win,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
      style: base,
    );
  }
}

class _SportChip extends StatelessWidget {
  const _SportChip({
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
    final colors = context.themeColors;
    final fg = selected ? const Color(0xFF0A0A0A) : colors.onSurface;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? AppColors.brand : colors.surfaceCard,
        shape: StadiumBorder(
          side: BorderSide(
            color: selected
                ? AppColors.brand
                : colors.outline.withValues(alpha: 0.5),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: fg,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '$count',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: fg.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ExpandButton extends StatelessWidget {
  const _ExpandButton({
    required this.expanded,
    required this.total,
    required this.hidden,
    required this.onTap,
  });

  final bool expanded;
  final int total;
  final int hidden;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 48,
        color: AppColors.brand.withValues(alpha: 0.05),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              expanded ? 'Mostrar menos' : 'Ver todas as $total quadras',
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: colors.brandText,
              ),
            ),
            if (!expanded && hidden > 0) ...[
              const SizedBox(width: 6),
              Text(
                '+$hidden',
                style: AppTypography.mono(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
            const SizedBox(width: 4),
            Icon(
              expanded
                  ? Icons.keyboard_arrow_up_rounded
                  : Icons.keyboard_arrow_down_rounded,
              size: 20,
              color: colors.brandText,
            ),
          ],
        ),
      ),
    );
  }
}
