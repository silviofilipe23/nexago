import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_card.dart';

/// G1 — Central de partidas.
class OrganizerMatchCenterPage extends ConsumerStatefulWidget {
  const OrganizerMatchCenterPage({
    super.key,
    required this.tournamentId,
    this.initialCategoryId = '',
  });

  final String tournamentId;
  final String initialCategoryId;

  @override
  ConsumerState<OrganizerMatchCenterPage> createState() =>
      _OrganizerMatchCenterPageState();
}

class _OrganizerMatchCenterPageState
    extends ConsumerState<OrganizerMatchCenterPage> {
  @override
  void initState() {
    super.initState();
    if (widget.initialCategoryId.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref
            .read(
              organizerMatchCenterCategoryProvider(
                widget.tournamentId,
              ).notifier,
            )
            .select(widget.initialCategoryId);
      });
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(organizerMatchOpsRepositoryProvider)
          .ensureCourtsInitialized(tournamentId: widget.tournamentId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(
      organizerMatchOpsStateProvider(widget.tournamentId),
    );
    final filter = ref.watch(
      organizerMatchCenterFilterProvider(widget.tournamentId),
    );
    final category = ref.watch(
      organizerMatchCenterCategoryProvider(widget.tournamentId),
    );
    final matchesAsync = ref.watch(
      organizerTournamentMatchesProvider(widget.tournamentId),
    );
    final detail = ref.watch(
      organizerTournamentDetailProvider(widget.tournamentId),
    );

    final allMatches = matchesAsync.valueOrNull ?? const [];
    final liveCount = allMatches.where((m) => m.isInProgress).length;
    final onCourtCount = allMatches.where((m) => m.isOnCourt).length;
    final totalCount = allMatches.length;

    final tournamentName = detail.valueOrNull?.summary?.name ?? 'Torneio';
    final dayKey = state.config.activeDayKey.trim();
    final dayLabel = dayKey.isNotEmpty ? dayKey.toUpperCase() : 'DIA 1';
    final eyebrow = '$tournamentName · $dayLabel';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: matchesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Erro: $e')),
          data: (_) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _MatchCenterHeader(
                eyebrow: eyebrow,
                liveCount: liveCount,
                onBack: () => context.pop(),
                onInsights: () => context.push(
                  organizerMatchInsightsPath(widget.tournamentId),
                ),
              ),
              const SizedBox(height: 4),
              _StatusFilterRow(
                filter: filter,
                totalCount: totalCount,
                liveCount: liveCount,
                onCourtCount: onCourtCount,
                onFilter: (f) => ref
                    .read(
                      organizerMatchCenterFilterProvider(
                        widget.tournamentId,
                      ).notifier,
                    )
                    .select(f),
              ),
              if (state.categories.isNotEmpty) ...[
                const SizedBox(height: 8),
                _CategoryFilterRow(
                  categories: state.categories,
                  categorySummaries:
                      detail.valueOrNull?.categories ?? const [],
                  selected: category,
                  onSelected: (id) => ref
                      .read(
                        organizerMatchCenterCategoryProvider(
                          widget.tournamentId,
                        ).notifier,
                      )
                      .select(id),
                ),
              ],
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 16),
                  children: [
                    if (state.sections.live.isNotEmpty) ...[
                      _SectionHeader(
                        title: 'ACONTECENDO AGORA',
                        trailing: '${state.sections.live.length} ao vivo',
                        trailingDotColor: AppColors.live,
                      ),
                      for (final row in state.sections.live)
                        OrganizerMatchCard(
                          row: row,
                          variant: OrganizerMatchCardVariant.center,
                          onTap: () => context.push(
                            organizerMatchLivePath(
                              widget.tournamentId,
                              row.match.id,
                            ),
                          ),
                        ),
                    ],
                    if (state.sections.upcoming.isNotEmpty) ...[
                      _SectionHeader(title: 'A SEGUIR · PRÓXIMAS A ENTRAR'),
                      for (final row in state.sections.upcoming)
                        OrganizerMatchCard(
                          row: row,
                          variant: OrganizerMatchCardVariant.center,
                          onTap: () => context.push(
                            organizerMatchCheckInPath(
                              widget.tournamentId,
                              row.match.id,
                            ),
                          ),
                        ),
                    ],
                    if (state.sections.finished.isNotEmpty) ...[
                      _SectionHeader(title: 'ENCERRADAS'),
                      for (final row in state.sections.finished)
                        OrganizerMatchCard(
                          row: row,
                          variant: OrganizerMatchCardVariant.center,
                          onTap: () => context.push(
                            organizerMatchSummaryPath(
                              widget.tournamentId,
                              row.match.id,
                            ),
                          ),
                        ),
                    ],
                    if (state.rows.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(
                          child: Text('Nenhuma partida encontrada.'),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Row(
            children: [
              OutlinedButton.icon(
                onPressed: () =>
                    context.push(organizerMatchQueuePath(widget.tournamentId)),
                icon: const Icon(Icons.format_list_bulleted_rounded, size: 18),
                label: const Text('Fila'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: context.themeColors.onSurface,
                  backgroundColor: context.themeColors.surfaceRaised,
                  side: BorderSide(
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.18,
                    ),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  textStyle: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => context.push(
                    organizerMatchSchedulePath(widget.tournamentId),
                  ),
                  icon: const Icon(Icons.calendar_month_rounded, size: 18),
                  label: const Text('Programação'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MatchCenterHeader extends StatelessWidget {
  const _MatchCenterHeader({
    required this.eyebrow,
    required this.liveCount,
    required this.onBack,
    required this.onInsights,
  });

  final String eyebrow;
  final int liveCount;
  final VoidCallback onBack;
  final VoidCallback onInsights;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _HeaderIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: 'Central de partidas',
                        style: AppTypography.soraRegular(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: context.themeColors.onSurface,
                          height: 1.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (liveCount > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.14,
                  ),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: AppColors.live,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '$liveCount',
                    style: AppTypography.mono(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(width: 8),
          _HeaderIconButton(
            icon: Icons.more_horiz_rounded,
            onPressed: onInsights,
          ),
        ],
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _StatusFilterRow extends StatelessWidget {
  const _StatusFilterRow({
    required this.filter,
    required this.totalCount,
    required this.liveCount,
    required this.onCourtCount,
    required this.onFilter,
  });

  final OrganizerMatchCenterFilter filter;
  final int totalCount;
  final int liveCount;
  final int onCourtCount;
  final ValueChanged<OrganizerMatchCenterFilter> onFilter;

  static const _height = 40.0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _height,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _FilterChip(
            label: 'Tudo',
            count: totalCount,
            selected: filter == OrganizerMatchCenterFilter.all,
            onTap: () => onFilter(OrganizerMatchCenterFilter.all),
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: 'Ao vivo',
            count: liveCount,
            dotColor: AppColors.live,
            selected: filter == OrganizerMatchCenterFilter.live,
            onTap: () => onFilter(OrganizerMatchCenterFilter.live),
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: 'Em quadra',
            count: onCourtCount,
            dotColor: AppColors.pending,
            selected: filter == OrganizerMatchCenterFilter.onCourt,
            onTap: () => onFilter(OrganizerMatchCenterFilter.onCourt),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.dotColor,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final Color? dotColor;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? AppColors.black : context.themeColors.onSurface;
    final bg = selected ? AppColors.brand : context.themeColors.surfaceRaised;
    final border = selected
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.14);

    return SizedBox(
      height: _StatusFilterRow._height,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: border),
            ),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (dotColor != null) ...[
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  '$label $count',
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: fg,
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

class _CategoryFilterRow extends StatelessWidget {
  const _CategoryFilterRow({
    required this.categories,
    required this.categorySummaries,
    required this.selected,
    required this.onSelected,
  });

  final List<String> categories;
  final List<OrganizerTournamentCategorySummary> categorySummaries;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _CategoryChip(
            label: 'Todas',
            selected: selected.isEmpty,
            onTap: () => onSelected(''),
          ),
          for (final catId in categories) ...[
            const SizedBox(width: 8),
            _CategoryChip(
              label: MatchOpsLogic.categoryDisplayLabel(
                categoryId: catId,
                categories: categorySummaries,
              ),
              selected: selected == catId,
              onTap: () => onSelected(catId),
            ),
          ],
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.45)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: selected
                  ? context.themeColors.onSurface
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.trailing,
    this.trailingDotColor,
  });

  final String title;
  final String? trailing;
  final Color? trailingDotColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.8,
              ),
            ),
          ),
          if (trailing != null) ...[
            if (trailingDotColor != null)
              Container(
                width: 6,
                height: 6,
                margin: const EdgeInsets.only(right: 6),
                decoration: BoxDecoration(
                  color: trailingDotColor,
                  shape: BoxShape.circle,
                ),
              ),
            Text(
              trailing!,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
