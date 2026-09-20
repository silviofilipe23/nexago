import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/tournament_create/king_of_court_plan.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_generate_bracket_helpers.dart';
import 'widgets/organizer_bracket_seed_preview.dart';

/// Publicação da chave King of the Court.
///
/// Diferença que importa em relação às outras telas de gerar chave: aqui a
/// prévia mostra o **tempo total de quadra** calculado com o número REAL de
/// duplas inscritas. No wizard a conta usa a capacidade; no dia da publicação
/// usa quem de fato pagou, que é o número que o organizador precisa comparar
/// com a reserva da quadra antes de apertar o botão.
class OrganizerCategoryGenerateKocPage extends ConsumerStatefulWidget {
  const OrganizerCategoryGenerateKocPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.format = 'king_of_court',
  });

  final String tournamentId;
  final String categoryId;
  final String format;

  @override
  ConsumerState<OrganizerCategoryGenerateKocPage> createState() =>
      _OrganizerCategoryGenerateKocPageState();
}

class _OrganizerCategoryGenerateKocPageState
    extends ConsumerState<OrganizerCategoryGenerateKocPage> {
  bool _publishing = false;
  KingOfCourtConfig _config = const KingOfCourtConfig();
  bool _configLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    try {
      final category = await ref
          .read(organizerCategoryOpsRepositoryProvider)
          .getCategory(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
          );
      if (!mounted) return;
      setState(() {
        _config = kingOfCourtConfigFromCategory(category);
        _configLoaded = true;
      });
    } catch (_) {
      // Sem a config da categoria a prévia usa os padrões do formato — que são
      // os mesmos que o backend aplicaria. Não trava a publicação.
      if (mounted) setState(() => _configLoaded = true);
    }
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
      final allTeams = await ref.read(
        organizerCategoryRegistrationsProvider(key).future,
      );
      final eligible = teamsEligibleForBracketDraw(allTeams);
      final seeds = ops.seeds.isNotEmpty
          ? filterSeedTeamIdsToEligible(ops.seeds, eligible)
          : eligible.map((t) => t.teamId).toList(growable: false);

      await ref
          .read(organizerCategoryOpsServiceProvider)
          .generateCategoryBracket(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            format: widget.format,
            seeds: seeds,
            force: force,
            // Explícito, e não herdado da categoria pelo backend: é o que
            // garante que a chave publicada seja a que a prévia mostrou.
            bracketConfig: _config.toBracketConfig(),
          );
      if (mounted) {
        await pushSuccessFeedback(
          context,
          title: 'Rodadas publicadas!',
          description: 'As rodadas já aparecem na categoria.',
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
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleSpacing: 8,
        leading: Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: () => context.pop(),
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(
                Icons.arrow_back_ios_new_rounded,
                size: 18,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ),
        title: const Text(
          'Gerar rodadas — King of the Court',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          final seeds = opsAsync.valueOrNull?.seeds ?? const <String>[];
          final eligible = teamsEligibleForBracketDraw(teams);
          final ordered = seeds.isNotEmpty
              ? applySeedOrder(
                  eligible,
                  filterSeedTeamIdsToEligible(seeds, eligible),
                )
              : eligible;
          final schedule = kingOfCourtSchedule(
            teamCount: ordered.length,
            teamsPerCourt: _config.teamsPerCourt,
            qualifiersPerRound: _config.qualifiersPerRound,
            roundDurationSec: _config.roundDurationSec,
          );
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _KocPlanCard(
                schedule: schedule,
                teamCount: ordered.length,
                config: _config,
                loading: !_configLoaded,
              ),
              const SizedBox(height: 20),
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
                : const Text('Publicar rodadas'),
          ),
        ),
      ),
    );
  }
}

/// A conta do dia, antes de publicar.
class _KocPlanCard extends StatelessWidget {
  const _KocPlanCard({
    required this.schedule,
    required this.teamCount,
    required this.config,
    required this.loading,
  });

  final KingOfCourtSchedule schedule;
  final int teamCount;
  final KingOfCourtConfig config;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final invalid = !schedule.isValid;
    final accent = invalid ? AppColors.pending : AppColors.brand;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: accent.withValues(alpha: 0.10),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                invalid ? Icons.error_outline : Icons.schedule_outlined,
                size: 18,
                color: accent,
              ),
              const SizedBox(width: 8),
              Text(
                loading
                    ? 'Calculando…'
                    : invalid
                    ? 'Configuração não fecha'
                    : '${schedule.totalLabel} de quadra',
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _body(),
            style: AppTypography.soraRegular(
              fontSize: 13,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }

  String _body() {
    if (teamCount < kocMinTeamsPerRound) {
      return 'King of the Court precisa de pelo menos $kocMinTeamsPerRound '
          'duplas pagas. Há $teamCount.';
    }
    if (!schedule.isValid) {
      return 'Com $teamCount duplas, ${config.qualifiersPerRound} '
          'classificadas por rodada não reduzem o campo entre as fases. '
          'Ajuste a configuração da categoria.';
    }
    final phases = schedule.roundsPerPhase
        .map((rounds) => rounds == 1 ? '1 rodada' : '$rounds rodadas')
        .join(' → ');
    final minutes = config.roundDurationSec ~/ 60;
    return '$teamCount duplas · ${schedule.totalRounds} rodadas de '
        '$minutes min em uma quadra ($phases), já com trocas e intervalos. '
        'A tabela da última rodada define o pódio.';
  }
}
