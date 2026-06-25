import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../tournament_create/widgets/organizer_form_widgets.dart';
import 'organizer_generate_bracket_helpers.dart';
import 'widgets/organizer_group_draw_widgets.dart';

class OrganizerCategoryGenerateGroupsPage extends ConsumerStatefulWidget {
  const OrganizerCategoryGenerateGroupsPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.format = 'groups_knockout',
  });

  final String tournamentId;
  final String categoryId;
  final String format;

  @override
  ConsumerState<OrganizerCategoryGenerateGroupsPage> createState() =>
      _OrganizerCategoryGenerateGroupsPageState();
}

class _OrganizerCategoryGenerateGroupsPageState
    extends ConsumerState<OrganizerCategoryGenerateGroupsPage> {
  List<CategoryGroupPreview> _groups = const [];
  bool _useSeeds = true;
  bool _publishing = false;
  bool _initialized = false;
  int? _groupCount;
  int _teamsPerGroup = 4;
  int _qualifiersPerGroup = 2;

  /// Mata-mata equilibrado (grupos × classificados = potência de 2 de cruzamentos).
  /// Só se aplica ao formato grupos+mata-mata; outros formatos não dependem disto.
  /// O servidor rejeita publicar quando desbalanceado — aqui só evita o toque inútil.
  bool get _knockoutBalanced {
    if (widget.format != 'groups_knockout') return true;
    final groupCount = _groupCount;
    if (groupCount == null) return false;
    return isBalancedKnockoutQualifierCount(
      totalKnockoutQualifiers(
        groupCount: groupCount,
        qualifiersPerGroup: _qualifiersPerGroup,
      ),
    );
  }

  void _assignGroups({
    required List<String> teamIds,
    required List<String> seedTeamIds,
  }) {
    final count = _groupCount ??
        defaultGroupCountForCategory(
          teamCount: teamIds.length,
          teamsPerGroup: _teamsPerGroup,
        );
    setState(() {
      _groups = distributeTeamsIntoGroups(
        teamIds: teamIds,
        seedTeamIds: seedTeamIds,
        respectSeeds: _useSeeds,
        groupCount: count,
      );
    });
  }

  Future<void> _initializeIfNeeded({
    required List<String> teamIds,
    required List<String> seedTeamIds,
  }) async {
    if (_initialized) return;
    _initialized = true;

    final category = await ref
        .read(organizerCategoryOpsRepositoryProvider)
        .getCategory(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
        );
    if (!mounted) return;

    final teamsPerGroup = (category?['teamsPerGroup'] as num?)?.toInt() ?? 4;
    final qualifiersPerGroup =
        (category?['qualifiersPerGroup'] as num?)?.toInt() ?? 2;

    setState(() {
      _teamsPerGroup = teamsPerGroup;
      _qualifiersPerGroup = qualifiersPerGroup;
      _groupCount = defaultGroupCountForCategory(
        teamCount: teamIds.length,
        teamsPerGroup: teamsPerGroup,
      );
    });
    _assignGroups(teamIds: teamIds, seedTeamIds: seedTeamIds);
  }

  Future<void> _publish({bool force = false}) async {
    if (_publishing) return;
    setState(() => _publishing = true);
    try {
      final key = OrganizerCategoryKey(
        tournamentId: widget.tournamentId,
        categoryId: widget.categoryId,
      );
      final ops = await ref
          .read(organizerCategoryOpsRepositoryProvider)
          .getCategoryOps(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
          );
      final allTeams =
          await ref.read(organizerCategoryRegistrationsProvider(key).future);
      final eligible = teamsEligibleForBracketDraw(allTeams);
      final seeds = _useSeeds && ops.seeds.isNotEmpty
          ? filterSeedTeamIdsToEligible(ops.seeds, eligible)
          : (_useSeeds
              ? defaultSeedOrderByRanking(eligible)
              : null);

      await ref.read(organizerCategoryOpsServiceProvider).generateCategoryBracket(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            format: widget.format,
            seeds: seeds,
            force: force,
            groupsPreview: _groups
                .map((g) => {'id': g.id, 'teamIds': g.teamIds})
                .toList(),
          );
      if (mounted) {
        await pushSuccessFeedback(
          context,
          title: 'Chave publicada!',
          description: 'Os jogos já aparecem na categoria.',
          primaryAction: FeedbackAction(
            label: 'Continuar',
            onPressed: () => Navigator.of(context).pop(),
          ),
        );
        if (mounted) context.pop();
      }
    } catch (e) {
      if (!mounted) return;
      if (isBracketHasResultsError(e)) {
        setState(() => _publishing = false);
        if (await confirmRegenerateBracket(context) && mounted) {
          await _publish(force: true);
        }
        return;
      }
      showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  OrganizerTournamentCategorySummary? _categorySummary(
    AsyncValue<OrganizerTournamentDetailState?> detail,
  ) {
    return detail.valueOrNull?.categories
        .where((c) => c.categoryId == widget.categoryId)
        .firstOrNull;
  }

  int _headCount({
    required int? groupCount,
    required List<String> seedTeamIds,
  }) {
    if (groupCount == null) return 0;
    if (!_useSeeds) return groupCount;
    if (seedTeamIds.isEmpty) return groupCount;
    return groupCount < seedTeamIds.length ? groupCount : seedTeamIds.length;
  }

  @override
  Widget build(BuildContext context) {
    final key = OrganizerCategoryKey(
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));
    final opsAsync = ref.watch(organizerCategoryOpsProvider(key));
    final detail = ref.watch(organizerTournamentDetailProvider(widget.tournamentId));
    final category = _categorySummary(detail);
    final eyebrow = seedingCategoryEyebrow(
      genderLabel: category?.genderLabel ?? '',
      levelLabel: category?.levelLabel ?? 'Open',
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          final ops = opsAsync.valueOrNull;
          final eligibleTeams = teamsEligibleForBracketDraw(teams);
          final excludedCount = teams.length - eligibleTeams.length;
          final seedTeamIds = filterSeedTeamIdsToEligible(
            ops?.seeds ?? const <String>[],
            eligibleTeams,
          );
          final teamIds =
              eligibleTeams.map((t) => t.teamId).toList(growable: false);
          final teamsById = {for (final t in eligibleTeams) t.teamId: t};
          final overallRankByTeamId = {
            for (var i = 0; i < eligibleTeams.length; i++)
              eligibleTeams[i].teamId: i + 1,
          };

          if (!_initialized) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _initializeIfNeeded(
                teamIds: teamIds,
                seedTeamIds: seedTeamIds,
              );
            });
          }

          final groupCount = _groupCount;
          final totalQualifiers = groupCount != null
              ? totalKnockoutQualifiers(
                  groupCount: groupCount,
                  qualifiersPerGroup: _qualifiersPerGroup,
                )
              : null;
          final knockoutBalanced = totalQualifiers != null &&
              isBalancedKnockoutQualifierCount(totalQualifiers);
          final ready = groupCount != null;

          void redraw() => _assignGroups(
                teamIds: teamIds,
                seedTeamIds: seedTeamIds,
              );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SafeArea(
                bottom: false,
                child: OrganizerGroupDrawHeader(
                  eyebrow: eyebrow,
                  onBack: () => context.pop(),
                  onClose: () => context.pop(),
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  children: [
                    if (!ready)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else ...[
                      const OrganizerSectionLabel('Nº DE GRUPOS'),
                      const SizedBox(height: 8),
                      OrganizerGroupCountStepper(
                        groupCount: groupCount,
                        minReached: groupCount <= 1,
                        maxReached: groupCount >= teamIds.length,
                        onDecrement: () {
                          if (groupCount <= 1) return;
                          setState(() => _groupCount = groupCount - 1);
                          redraw();
                        },
                        onIncrement: () {
                          if (groupCount >= teamIds.length) return;
                          setState(() => _groupCount = groupCount + 1);
                          redraw();
                        },
                      ),
                      const SizedBox(height: 12),
                      OrganizerGroupDrawStatsRow(
                        teamCount: teamIds.length,
                        qualifiersPerGroup: _qualifiersPerGroup,
                        totalQualifiers: totalQualifiers!,
                      ),
                      if (excludedCount > 0) ...[
                        const SizedBox(height: 12),
                        OrganizerGroupDrawExcludedBanner(
                          excludedCount: excludedCount,
                        ),
                      ],
                      const SizedBox(height: 12),
                      OrganizerGroupSeedsToggleCard(
                        value: _useSeeds,
                        headCount: _headCount(
                          groupCount: groupCount,
                          seedTeamIds: seedTeamIds,
                        ),
                        onChanged: (value) {
                          setState(() => _useSeeds = value);
                          redraw();
                        },
                      ),
                      if (!knockoutBalanced) ...[
                        const SizedBox(height: 12),
                        OrganizerGroupDrawKnockoutWarningBanner(
                          totalQualifiers: totalQualifiers,
                          groupCount: groupCount,
                          qualifiersPerGroup: _qualifiersPerGroup,
                        ),
                      ],
                      const SizedBox(height: 20),
                      OrganizerGroupDrawSectionHeader(onRedraw: redraw),
                      const SizedBox(height: 12),
                      ..._groups.map(
                        (g) => OrganizerGroupDrawCard(
                          group: g,
                          teamsById: teamsById,
                          qualifiersPerGroup: _qualifiersPerGroup,
                          primaryHeadCount: groupCount,
                          overallRankByTeamId: overallRankByTeamId,
                        ),
                      ),
                      const SizedBox(height: 8),
                      OrganizerGroupDrawInfoBanner(
                        qualifiersPerGroup: _qualifiersPerGroup,
                      ),
                      const SizedBox(height: 140),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: teamsAsync.maybeWhen(
        data: (_) => OrganizerGroupDrawBottomActions(
          onRedraw: () {
            final teams = teamsAsync.valueOrNull ?? const [];
            final ops = opsAsync.valueOrNull;
            final eligible = teamsEligibleForBracketDraw(teams);
            final seedTeamIds = filterSeedTeamIdsToEligible(
              ops?.seeds ?? const <String>[],
              eligible,
            );
            final teamIds =
                eligible.map((t) => t.teamId).toList(growable: false);
            if (_groupCount == null) return;
            _assignGroups(teamIds: teamIds, seedTeamIds: seedTeamIds);
          },
          onPublish: _publish,
          publishing: _publishing,
          enabled: _groupCount != null && _knockoutBalanced,
        ),
        orElse: () => null,
      ),
    );
  }
}
