import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/athlete_profile_options.dart';
import '../domain/athlete_sports_levels_labels.dart';
import '../domain/athlete_sports_levels_providers.dart';
import '../onboarding/domain/athlete_onboarding_options.dart';
import 'widgets/athlete_level_zone_card.dart';
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
      backgroundColor: context.themeColors.canvas,
      appBar: _appBar(context, theme),
      body: switch (ui.status) {
        AthleteSportsLevelsStatus.loading => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        AthleteSportsLevelsStatus.error => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              ui.errorMessage ?? 'Erro ao carregar perfil.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
        AthleteSportsLevelsStatus.ready => _ReadyBody(
          ui: ui,
          onLevelSelected: (appSportId, level) => _onLevelSelected(
            context,
            ui: ui,
            appSportId: appSportId,
            level: level,
            onConfirm: () => notifier.updateLevel(appSportId, level),
          ),
          onAddSport: (option) => _onAddSport(
            context,
            option: option,
            onConfirm: (level) => notifier.addSport(option.id, level),
          ),
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
    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
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
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
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
          color: context.themeColors.onSurface,
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
                color: context.themeColors.onSurfaceMuted,
                height: 1.35,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Janela de calibração: antes da 1ª inscrição ativa no esporte, o atleta
  /// ajusta o nível livremente (sem confirmação — nada é definitivo ainda).
  /// Depois do lock, exatamente a regra "nível só sobe" de sempre: abaixo do
  /// salvo → explica o bloqueio; acima → confirma antes de aplicar (a
  /// mudança não pode ser desfeita pelo atleta).
  Future<void> _onLevelSelected(
    BuildContext context, {
    required AthleteSportsLevelsUiState ui,
    required String appSportId,
    required String level,
    required VoidCallback onConfirm,
  }) async {
    final current = ui.draft.levelByAppSportId[appSportId];
    if (AthleteProfileOptions.normalizeLevel(current) ==
        AthleteProfileOptions.normalizeLevel(level)) {
      return;
    }

    if (!ui.isLevelLockedFor(appSportId)) {
      onConfirm();
      return;
    }

    final lockedRank = ui.lockedLevelRankFor(appSportId);
    final nextRank = AthleteProfileOptions.levelRank(level);
    if (lockedRank != null && (nextRank == null || nextRank < lockedRank)) {
      showAppSnackBar(context, athleteLevelDowngradeBlockedMessage);
      return;
    }

    final confirmed = await _confirmLevelChange(
      context,
      sportLabel: _labelForSport(ui, appSportId),
      levelLabel: AthleteProfileOptions.normalizeLevel(level),
    );
    if (confirmed) onConfirm();
  }

  /// Escolha obrigatória: abre o seletor de nível antes de matricular o
  /// esporte novo — nenhum nível é preselecionado, e "Adicionar esporte" só
  /// libera depois de um chip escolhido. Cancelar não adiciona nada.
  Future<void> _onAddSport(
    BuildContext context, {
    required OnboardingSportOption option,
    required ValueChanged<String> onConfirm,
  }) async {
    final level = await _pickLevelForNewSport(
      context,
      sportLabel: option.label,
    );
    if (level == null) return;
    onConfirm(level);
  }

  Future<String?> _pickLevelForNewSport(
    BuildContext context, {
    required String sportLabel,
  }) async {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceRaised,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final t = Theme.of(ctx);
        String? selected;
        return StatefulBuilder(
          builder: (ctx, setState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Qual é o seu nível em $sportLabel?',
                      style: t.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: ctx.themeColors.onSurface,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Escolha um nível para adicionar o esporte. Até a sua '
                      'primeira inscrição, você pode ajustar livremente — '
                      'depois ele só sobe.',
                      style: t.textTheme.bodySmall?.copyWith(
                        color: ctx.themeColors.onSurfaceMuted,
                        height: 1.35,
                      ),
                    ),
                    SizedBox(height: 16),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: AthleteProfileOptions.levels.map((option) {
                        final isSelected = selected == option;
                        return _NewSportLevelChip(
                          label: AthleteSportsLevelsLabels.abbreviationFor(
                            option,
                          ),
                          selected: isSelected,
                          onTap: () => setState(() => selected = option),
                        );
                      }).toList(),
                    ),
                    SizedBox(height: 20),
                    FilledButton(
                      onPressed: selected == null
                          ? null
                          : () => Navigator.of(ctx).pop(selected),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: ctx.themeColors.canvas,
                      ),
                      child: Text('Adicionar esporte'),
                    ),
                    SizedBox(height: 8),
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      child: Text('Cancelar'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<bool> _confirmLevelChange(
    BuildContext context, {
    required String sportLabel,
    required String levelLabel,
  }) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.themeColors.surfaceRaised,
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
                  'Confirmar novo nível',
                  style: t.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  sportLabel.isEmpty
                      ? 'Seu nível passará a $levelLabel.'
                      : '$sportLabel: seu nível passará a $levelLabel.',
                  style: t.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'O nível só pode subir. Para reduzir depois, será preciso '
                  'falar com o suporte. Em torneios, você disputa apenas '
                  'categorias do seu nível ou acima.',
                  style: t.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
                SizedBox(height: 20),
                FilledButton(
                  onPressed: () => Navigator.of(ctx).pop(true),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: context.themeColors.canvas,
                  ),
                  child: Text('Confirmar nível'),
                ),
                SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(false),
                  child: Text('Cancelar'),
                ),
              ],
            ),
          ),
        );
      },
    );
    return confirmed == true;
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
      backgroundColor: context.themeColors.surfaceRaised,
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
                    color: context.themeColors.onSurface,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  sportLabel.isEmpty
                      ? 'Este esporte passará a ser o principal do seu perfil.'
                      : '$sportLabel será seu esporte principal.',
                  style: t.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                SizedBox(height: 20),
                FilledButton(
                  onPressed: () => Navigator.of(ctx).pop(true),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: context.themeColors.canvas,
                  ),
                  child: Text('Tornar principal'),
                ),
                SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(false),
                  child: Text('Cancelar'),
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
  final void Function(OnboardingSportOption option) onAddSport;
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
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.brand,
                  ),
                ),
                SizedBox(width: 10),
                Text(
                  'Salvando…',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        Text(
          'SEUS ESPORTES',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            fontSize: 10,
          ),
        ),
        SizedBox(height: 6),
        Text(
          'Seu nível é atualizado automaticamente com base nos seus '
          'resultados em torneios. Você pode subir de nível manualmente, '
          'mas não reduzir — para corrigir um nível errado, fale com o '
          'suporte.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            height: 1.35,
            fontSize: 12,
          ),
        ),
        SizedBox(height: 10),
        if (ui.enrollments.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Adicione um esporte abaixo para começar.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
        else
          ...ui.enrollments.map((e) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AthleteSportLevelCard(
                    enrollment: e,
                    totalGames: ui.totalGames,
                    selectedLevel:
                        ui.draft.levelByAppSportId[e.appSportId] ??
                            e.levelLabel,
                    lockedLevelRank: ui.lockedLevelRankFor(e.appSportId) ?? -1,
                    enabled: canEdit,
                    levelLocked: ui.isLevelLockedFor(e.appSportId),
                    onLevelSelected: (level) =>
                        onLevelSelected(e.appSportId, level),
                    onMakePrimary: () => onMakePrimary(e.appSportId),
                  ),
                  // Zona da escada (engine de rating) — só aparece quando a
                  // engine já processou partidas do atleta neste esporte.
                  AthleteLevelZoneCard(sportCode: e.firestoreSportId),
                ],
              ),
            );
          }),
        SizedBox(height: 20),
        Text(
          'ADICIONAR ESPORTE',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            fontSize: 10,
          ),
        ),
        SizedBox(height: 10),
        if (ui.availableToAdd.isEmpty)
          Text(
            'Você já adicionou todos os esportes disponíveis.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
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
                onTap: () => onAddSport(option),
              );
            }).toList(),
          ),
        SizedBox(height: 24),
        const AthleteSportsInviteBanner(),
      ],
    );
  }
}

/// Chip de nível do sheet "adicionar esporte" — igual ao chip do card
/// (`_LevelChip` em `athlete_sport_level_card.dart`), mas nunca com cadeado:
/// esporte novo não tem nível salvo ainda, então nada aqui pode estar
/// bloqueado.
class _NewSportLevelChip extends StatelessWidget {
  const _NewSportLevelChip({
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
      color: selected ? AppColors.brand : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Text(
            label,
            style: AppTypography.mono(
              fontWeight: FontWeight.w700,
              color: selected
                  ? context.themeColors.canvas
                  : context.themeColors.onSurfaceMuted,
              fontSize: 11,
            ),
          ),
        ),
      ),
    );
  }
}
