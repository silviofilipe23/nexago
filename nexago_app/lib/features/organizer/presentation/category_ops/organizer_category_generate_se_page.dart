import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';

class OrganizerCategoryGenerateSePage extends ConsumerStatefulWidget {
  const OrganizerCategoryGenerateSePage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.format = 'single_elimination',
  });

  final String tournamentId;
  final String categoryId;
  final String format;

  @override
  ConsumerState<OrganizerCategoryGenerateSePage> createState() =>
      _OrganizerCategoryGenerateSePageState();
}

class _OrganizerCategoryGenerateSePageState
    extends ConsumerState<OrganizerCategoryGenerateSePage> {
  bool _publishing = false;

  Future<void> _publish() async {
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
      final seeds = ops.seeds.isNotEmpty
          ? ops.seeds
          : teams.map((t) => t.teamId).toList(growable: false);

      await ref.read(organizerCategoryOpsServiceProvider).generateCategoryBracket(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            format: widget.format,
            seeds: seeds,
            bracketConfig: {
              'winnersAdvantage': ops.winnersAdvantage,
              'phaseBestOf': ops.phaseBestOf,
              'finalBestOf5': ops.finalBestOf5,
              'thirdPlaceEnabled': ops.thirdPlaceEnabled,
            },
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
      appBar: NexaAppBar(
        title: const Text('Gerar chave — eliminatória simples'),
        backgroundColor: context.themeColors.canvas,
      ),
      body: teamsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (teams) {
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'Prévia',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Text(
                '${teams.length} duplas confirmadas serão distribuídas na chave mata-mata.',
                style: Theme.of(context).textTheme.bodySmall,
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
