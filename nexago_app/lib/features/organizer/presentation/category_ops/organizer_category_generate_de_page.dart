import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_generate_bracket_helpers.dart';
import 'widgets/organizer_bracket_seed_preview.dart';

class OrganizerCategoryGenerateDePage extends ConsumerStatefulWidget {
  const OrganizerCategoryGenerateDePage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.format = 'double_elimination',
  });

  final String tournamentId;
  final String categoryId;
  final String format;

  @override
  ConsumerState<OrganizerCategoryGenerateDePage> createState() =>
      _OrganizerCategoryGenerateDePageState();
}

class _OrganizerCategoryGenerateDePageState
    extends ConsumerState<OrganizerCategoryGenerateDePage> {
  bool _publishing = false;

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
      final seeds = ops.seeds.isNotEmpty
          ? filterSeedTeamIdsToEligible(ops.seeds, eligible)
          : eligible.map((t) => t.teamId).toList(growable: false);

      await ref.read(organizerCategoryOpsServiceProvider).generateCategoryBracket(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            format: widget.format,
            seeds: seeds,
            force: force,
            bracketConfig: {
              'winnersAdvantage': ops.winnersAdvantage,
              'phaseBestOf': ops.phaseBestOf,
              'finalBestOf5': ops.finalBestOf5,
              'thirdPlaceEnabled': ops.thirdPlaceEnabled,
            },
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

  @override
  Widget build(BuildContext context) {
    final key = OrganizerCategoryKey(
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));
    final opsAsync = ref.watch(organizerCategoryOpsProvider(key));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        title: const Text('Gerar chave — dupla eliminatória'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          final seeds = opsAsync.valueOrNull?.seeds ?? const <String>[];
          final eligible = teamsEligibleForBracketDraw(teams);
          final filteredSeeds = filterSeedTeamIdsToEligible(seeds, eligible);
          final ordered = filteredSeeds.isNotEmpty
              ? applySeedOrder(eligible, filteredSeeds)
              : applySeedOrder(
                  eligible,
                  defaultSeedOrderByRanking(eligible),
                );
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              OrganizerBracketSeedPreview(teams: ordered),
            ],
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _publishing ? null : _publish,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              minimumSize: const Size.fromHeight(48),
            ),
            child: _publishing
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Publicar chave'),
          ),
        ),
      ),
    );
  }
}
