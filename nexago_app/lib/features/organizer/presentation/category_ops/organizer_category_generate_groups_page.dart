import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_generate_bracket_helpers.dart';

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

  void _assignGroups({
    required List<String> teamIds,
    required List<String> seedTeamIds,
  }) {
    setState(() {
      _groups = distributeTeamsIntoGroups(
        teamIds: teamIds,
        seedTeamIds: seedTeamIds,
        respectSeeds: _useSeeds,
      );
    });
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
      final teams =
          await ref.read(organizerCategoryRegistrationsProvider(key).future);
      final seeds = _useSeeds && ops.seeds.isNotEmpty
          ? ops.seeds
          : (_useSeeds
              ? defaultSeedOrderByRanking(teams)
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
        showAppSnackBar(context, 'Chave publicada!');
        context.pop();
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
        title: const Text('Gerar chave — grupos'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          final ops = opsAsync.valueOrNull;
          final seedTeamIds = ops?.seeds ?? const <String>[];
          final teamIds = teams.map((t) => t.teamId).toList(growable: false);

          if (!_initialized) {
            _initialized = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _assignGroups(teamIds: teamIds, seedTeamIds: seedTeamIds);
            });
          }

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              SwitchListTile(
                title: const Text('Respeitar cabeças de chave'),
                value: _useSeeds,
                onChanged: (value) {
                  setState(() => _useSeeds = value);
                  _assignGroups(teamIds: teamIds, seedTeamIds: seedTeamIds);
                },
              ),
              ..._groups.map(
                (g) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Grupo ${g.id}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        ...g.teamIds.map((id) {
                          final team =
                              teams.where((t) => t.teamId == id).firstOrNull;
                          final seedLabel = team?.seedRank != null
                              ? ' (#${team!.seedRank})'
                              : '';
                          return Text('${team?.displayName ?? id}$seedLabel');
                        }),
                      ],
                    ),
                  ),
                ),
              ),
              OutlinedButton(
                onPressed: () =>
                    _assignGroups(teamIds: teamIds, seedTeamIds: seedTeamIds),
                child: const Text('Sortear de novo'),
              ),
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
