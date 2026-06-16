import 'dart:async';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';

class OrganizerCategorySeedingPage extends ConsumerStatefulWidget {
  const OrganizerCategorySeedingPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<OrganizerCategorySeedingPage> createState() =>
      _OrganizerCategorySeedingPageState();
}

class _OrganizerCategorySeedingPageState
    extends ConsumerState<OrganizerCategorySeedingPage> {
  List<OrganizerCategoryTeamRow> _teams = [];
  bool _seedByRanking = true;
  Timer? _saveTimer;

  @override
  void dispose() {
    _saveTimer?.cancel();
    super.dispose();
  }

  void _scheduleSave(List<String> seeds) {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 500), () async {
      final ops = await ref
          .read(organizerCategoryOpsRepositoryProvider)
          .getCategoryOps(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
          );
      await ref.read(organizerCategoryOpsRepositoryProvider).saveCategoryOps(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            state: CategoryOpsState(
              seeds: seeds,
              seedByRanking: _seedByRanking,
              bracketStatus: ops.bracketStatus,
              bracketFormatOverride: ops.bracketFormatOverride,
              winnersAdvantage: ops.winnersAdvantage,
              phaseBestOf: ops.phaseBestOf,
              finalBestOf5: ops.finalBestOf5,
              thirdPlaceEnabled: ops.thirdPlaceEnabled,
              groupsPreview: ops.groupsPreview,
            ),
          );
    });
  }

  @override
  Widget build(BuildContext context) {
    final key = OrganizerCategoryKey(
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        title: const Text('Cabeças de chave'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          if (_teams.isEmpty) _teams = teams;
          return Column(
            children: [
              SwitchListTile(
                title: const Text('Ordenar por ranking'),
                value: _seedByRanking,
                activeColor: AppColors.brand,
                onChanged: (v) {
                  setState(() {
                    _seedByRanking = v;
                    if (v) {
                      final order = defaultSeedOrderByRanking(_teams);
                      _teams = applySeedOrder(_teams, order);
                      _scheduleSave(order);
                    }
                  });
                },
              ),
              Expanded(
                child: ReorderableListView.builder(
                  itemCount: _teams.length,
                  onReorder: (oldIndex, newIndex) {
                    setState(() {
                      if (newIndex > oldIndex) newIndex--;
                      final item = _teams.removeAt(oldIndex);
                      _teams.insert(newIndex, item);
                      final seeds = _teams.map((t) => t.teamId).toList();
                      _teams = applySeedOrder(_teams, seeds);
                      _scheduleSave(seeds);
                    });
                  },
                  itemBuilder: (context, index) {
                    final team = _teams[index];
                    return ListTile(
                      key: ValueKey(team.teamId),
                      leading: Text('C${team.seedRank ?? index + 1}'),
                      title: Text(team.displayName),
                      trailing: const Icon(Icons.drag_handle_rounded),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: () {
              showAppSnackBar(context, 'Ordem salva.');
              context.pop();
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Salvar'),
          ),
        ),
      ),
    );
  }
}
