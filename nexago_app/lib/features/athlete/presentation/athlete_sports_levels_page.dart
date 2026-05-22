import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/athlete_sports_levels_providers.dart';
import 'widgets/athlete_sports_levels/athlete_sport_add_chip.dart';
import 'widgets/athlete_sports_levels/athlete_sport_level_card.dart';
import 'widgets/athlete_sports_levels/athlete_sports_invite_banner.dart';

/// Esportes e níveis do atleta (protótipo 12).
class AthleteSportsLevelsPage extends ConsumerWidget {
  const AthleteSportsLevelsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ui = ref.watch(athleteSportsLevelsProvider);
    final notifier = ref.read(athleteSportsLevelsProvider.notifier);
    final theme = Theme.of(context);

    ref.listen(athleteSportsLevelsProvider, (prev, next) {
      if (next.errorMessage != null &&
          next.errorMessage != prev?.errorMessage) {
        showAppSnackBar(context, next.errorMessage!);
      }
    });

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme),
      body: switch (ui.status) {
        AthleteSportsLevelsStatus.loading => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        AthleteSportsLevelsStatus.error => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              ui.errorMessage ?? 'Erro ao carregar perfil.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
        AthleteSportsLevelsStatus.ready => _ReadyBody(
          ui: ui,
          onLevelSelected: notifier.updateLevel,
          onAddSport: notifier.addSport,
          onMakePrimary: (appSportId) => _confirmMakePrimary(
            context,
            sportLabel: _labelForSport(ui, appSportId),
            onConfirm: () => notifier.setPrimary(appSportId),
          ),
        ),
      },
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: AppColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.athleteSettings);
                }
              },
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: AppColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Esportes e níveis',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(52),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Quanto mais detalhe, melhores são as partidas que a gente sugere.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                height: 1.35,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }

  static String _labelForSport(
    AthleteSportsLevelsUiState ui,
    String appSportId,
  ) {
    for (final e in ui.enrollments) {
      if (e.appSportId == appSportId) return e.label;
    }
    return '';
  }

  Future<void> _confirmMakePrimary(
    BuildContext context, {
    required String sportLabel,
    required VoidCallback onConfirm,
  }) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.surfaceRaised,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final t = Theme.of(ctx);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Tornar esporte principal',
                  style: t.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  sportLabel.isEmpty
                      ? 'Este esporte passará a ser o principal do seu perfil.'
                      : '$sportLabel será seu esporte principal.',
                  style: t.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () => Navigator.of(ctx).pop(true),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.canvas,
                  ),
                  child: const Text('Tornar principal'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(false),
                  child: const Text('Cancelar'),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (confirmed == true) onConfirm();
  }
}

class _ReadyBody extends StatelessWidget {
  const _ReadyBody({
    required this.ui,
    required this.onLevelSelected,
    required this.onAddSport,
    required this.onMakePrimary,
  });

  final AthleteSportsLevelsUiState ui;
  final void Function(String appSportId, String level) onLevelSelected;
  final void Function(String appSportId) onAddSport;
  final void Function(String appSportId) onMakePrimary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canEdit = ui.canEdit;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        if (ui.isSaving)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.brand,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  'Salvando…',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        Text(
          'SEUS ESPORTES',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 10),
        if (ui.enrollments.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Adicione um esporte abaixo para começar.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
            ),
          )
        else
          ...ui.enrollments.map((e) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AthleteSportLevelCard(
                enrollment: e,
                totalGames: ui.totalGames,
                selectedLevel:
                    ui.draft.levelByAppSportId[e.appSportId] ?? e.levelLabel,
                enabled: canEdit,
                onLevelSelected: (level) =>
                    onLevelSelected(e.appSportId, level),
                onMakePrimary: () => onMakePrimary(e.appSportId),
              ),
            );
          }),
        const SizedBox(height: 20),
        Text(
          'ADICIONAR ESPORTE',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 10),
        if (ui.availableToAdd.isEmpty)
          Text(
            'Você já adicionou todos os esportes disponíveis.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.onSurfaceMuted,
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: ui.availableToAdd.map((option) {
              return AthleteSportAddChip(
                option: option,
                enabled: canEdit,
                onTap: () => onAddSport(option.id),
              );
            }).toList(),
          ),
        const SizedBox(height: 24),
        const AthleteSportsInviteBanner(),
      ],
    );
  }
}
