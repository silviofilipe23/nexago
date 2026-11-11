import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
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
///
/// Na arena que define a quadra (`bookingAllocation` "capacity") tocar numa quadra não escolhe
/// aquela quadra: a seção vira uma linha por esporte reservável (abre a grade por horário no
/// esporte) e os nomes das quadras ficam só como estrutura. No modo misto, "Prefiro escolher a
/// quadra" abre a lista por quadra.
class ArenaDetailCourtsSection extends StatefulWidget {
  const ArenaDetailCourtsSection({
    super.key,
    required this.arena,
    required this.today,
    required this.loading,
    required this.onOpenCourt,
    this.onOpenSport,
  });

  final ArenaListItem arena;
  final ArenaDetailTodaySummary? today;
  final bool loading;
  final ValueChanged<String> onOpenCourt;

  /// Arena que define a quadra: abre a grade por horário no esporte (código do catálogo).
  final ValueChanged<String>? onOpenSport;

  @override
  State<ArenaDetailCourtsSection> createState() =>
      _ArenaDetailCourtsSectionState();
}

class _ArenaDetailCourtsSectionState extends State<ArenaDetailCourtsSection> {
  bool _expanded = false;
  String? _sport;
  bool _chooseCourt = false;
  bool _tagsExpanded = false;

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
    final allocation = widget.arena.bookingAllocation;
    final sportRows = widget.onOpenSport == null
        ? const <CapacitySportRow>[]
        : capacitySportRows(allocation, courts);
    final capacity = sportRows.isNotEmpty;

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
        if (courts.isNotEmpty)
          _Summary(
            today: today!,
            arenaDefines: capacity && !allocation.allowCourtChoice,
          ),
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
    } else if (capacity) {
      body = _buildCapacity(context, courts, sportRows);
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

  Widget _buildCapacity(
    BuildContext context,
    List<ArenaCourtDaySummary> courts,
    List<CapacitySportRow> rows,
  ) {
    final colors = context.themeColors;
    final allocation = widget.arena.bookingAllocation;
    final mixed = allocation.allowCourtChoice;
    final divider = Divider(
        height: 1, thickness: 1, color: colors.outline.withValues(alpha: 0.35));
    final subtitle = mixed
        ? 'Se preferir uma quadra específica, escolha abaixo.'
        : allocation.revealBeforeArrival
            ? 'A arena avisa a quadra antes do horário. Escolha o esporte para ver os horários.'
            : 'A quadra aparece na chegada. Escolha o esporte para ver os horários.';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CapacityNotice(
          title: mixed
              ? 'Reserve o horário, a arena define a quadra'
              : 'Você reserva o horário, a arena define a quadra',
          subtitle: subtitle,
        ),
        const SizedBox(height: 12),
        _GroupCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) divider,
                _CapacitySportTile(
                  row: rows[i],
                  onTap: () => widget.onOpenSport!(rows[i].sport),
                ),
              ],
            ],
          ),
        ),
        if (mixed) ...[
          const SizedBox(height: 14),
          _ChooseCourtToggle(
            expanded: _chooseCourt,
            total: courts.length,
            onTap: () => setState(() => _chooseCourt = !_chooseCourt),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: const Cubic(0.22, 1, 0.36, 1),
            alignment: Alignment.topCenter,
            child: _chooseCourt
                ? Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: _buildList(context, courts),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ] else
          _CourtsStructure(
            arena: widget.arena,
            courts: courts,
            expanded: _tagsExpanded,
            onToggle: () => setState(() => _tagsExpanded = !_tagsExpanded),
          ),
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
  const _Summary({required this.today, this.arenaDefines = false});

  final ArenaDetailTodaySummary today;

  /// Arena que define a quadra: o resumo diz isso no lugar das quadras livres.
  final bool arenaDefines;

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
          if (arenaDefines) ...[
            const TextSpan(text: ' · '),
            TextSpan(
              text: 'A ARENA DEFINE',
              style: base.copyWith(
                color: colors.brandText,
                fontWeight: FontWeight.w600,
              ),
            ),
          ] else if (free > 0) ...[
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

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

class _CapacityNotice extends StatelessWidget {
  const _CapacityNotice({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.30)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.swap_horiz_rounded,
              size: 20,
              color: colors.brandText,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.4,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CapacitySportTile extends StatelessWidget {
  const _CapacitySportTile({required this.row, required this.onTap});

  final CapacitySportRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hasFree = row.freeCourtsToday > 0;
    final statusColor = hasFree ? colors.win : colors.onSurfaceMuted;
    final price = row.pricePerHour;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 72),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: colors.outline.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Icon(
                    Icons.sports_volleyball_rounded,
                    size: 20,
                    color: colors.brandText,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        row.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${row.courtCount} ${row.courtCount == 1 ? 'quadra' : 'quadras'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: colors.onSurfaceMuted,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: statusColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(
                              capacitySportStatusLabel(row),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.soraRegular(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: statusColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (price != null) ...[
                  const SizedBox(width: 10),
                  Text.rich(
                    TextSpan(
                      text: formatBRLWhole(price),
                      children: [
                        TextSpan(
                          text: '/h',
                          style: AppTypography.mono(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                    style: AppTypography.mono(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ],
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: colors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Estrutura da arena que define a quadra: os nomes das quadras só como informação.
class _CourtsStructure extends StatelessWidget {
  const _CourtsStructure({
    required this.arena,
    required this.courts,
    required this.expanded,
    required this.onToggle,
  });

  final ArenaListItem arena;
  final List<ArenaCourtDaySummary> courts;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // Ordem por nome: aqui é estrutura, não disponibilidade.
    final sorted = [for (final s in courts) s.court]
      ..sort((a, b) => compareCourtNames(a.name, b.name));
    final collapsible = sorted.length > kArenaDetailCourtTagsCollapsedCount;
    final shown = collapsible && !expanded
        ? sorted.take(kArenaDetailCourtTagsCollapsedCount).toList()
        : sorted;
    final hidden = sorted.length - shown.length;
    final label = AppTypography.mono(
      fontSize: 9.5,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.4,
      color: colors.onSurfaceMuted,
    );
    final tagStyle = AppTypography.mono(
      fontSize: 11,
      fontWeight: FontWeight.w500,
      color: colors.onSurface,
    );

    Widget tag(String text, {bool off = false}) => Opacity(
          opacity: off ? 0.45 : 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
            ),
            child: Text(text, style: tagStyle),
          ),
        );

    return Padding(
      padding: const EdgeInsets.only(top: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'ESTRUTURA · ${sorted.length} ${sorted.length == 1 ? 'QUADRA' : 'QUADRAS'}',
                  style: label,
                ),
              ),
              Text(
                arena.amenities.coveredCourt ? 'COBERTAS' : 'ABERTAS',
                style: label,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final c in shown)
                Semantics(
                  label: c.isMaintenance ? '${c.name}, em manutenção' : c.name,
                  excludeSemantics: true,
                  child: tag(c.name, off: c.isMaintenance),
                ),
              if (collapsible)
                Material(
                  color: AppColors.brand.withValues(alpha: 0.06),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(
                      color: AppColors.brand.withValues(alpha: 0.35),
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: onToggle,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      child: Text(
                        expanded ? 'Mostrar menos' : '+$hidden quadras',
                        style: AppTypography.soraRegular(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: colors.brandText,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChooseCourtToggle extends StatelessWidget {
  const _ChooseCourtToggle({
    required this.expanded,
    required this.total,
    required this.onTap,
  });

  final bool expanded;
  final int total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.outline.withValues(alpha: 0.5)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          height: 48,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Prefiro escolher a quadra · $total ${total == 1 ? 'quadra' : 'quadras'}',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Icon(
                  expanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  size: 20,
                  color: colors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
