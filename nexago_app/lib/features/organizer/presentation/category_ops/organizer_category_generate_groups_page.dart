import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';

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

  void _shuffleGroups(List<String> teamIds) {
    final random = Random();
    final shuffled = [...teamIds]..shuffle(random);
    final half = (shuffled.length / 2).ceil();
    setState(() {
      _groups = [
        CategoryGroupPreview(id: 'A', teamIds: shuffled.take(half).toList()),
        CategoryGroupPreview(id: 'B', teamIds: shuffled.skip(half).toList()),
      ];
    });
  }

  Future<void> _publish() async {
    if (_publishing) return;
    setState(() => _publishing = true);
    try {
      final key = OrganizerCategoryKey(
        tournamentId: widget.tournamentId,
        categoryId: widget.categoryId,
      );
      final teams = await ref.read(organizerCategoryRegistrationsProvider(key).future);
      final teamIds = teams.map((t) => t.teamId).toList(growable: false);
      final seeds = teamIds;
      await ref.read(organizerCategoryOpsServiceProvider).generateCategoryBracket(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            format: widget.format,
            seeds: _useSeeds ? seeds : null,
            groupsPreview: _groups
                .map((g) => {'id': g.id, 'teamIds': g.teamIds})
                .toList(),
          );
      if (mounted) {
        showAppSnackBar(context, 'Chave publicada!');
        context.pop();
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
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

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        title: const Text('Gerar chave — grupos'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          if (_groups.isEmpty) {
            _shuffleGroups(teams.map((t) => t.teamId).toList(growable: false));
          }
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              SwitchListTile(
                title: const Text('Respeitar cabeças de chave'),
                value: _useSeeds,
                onChanged: (v) => setState(() => _useSeeds = v),
              ),
              ..._groups.map(
                (g) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Grupo ${g.id}',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        ...g.teamIds.map((id) {
                          final team = teams
                              .where((t) => t.teamId == id)
                              .firstOrNull;
                          return Text(team?.displayName ?? id);
                        }),
                      ],
                    ),
                  ),
                ),
              ),
              OutlinedButton(
                onPressed: () => _shuffleGroups(
                  teams.map((t) => t.teamId).toList(growable: false),
                ),
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
