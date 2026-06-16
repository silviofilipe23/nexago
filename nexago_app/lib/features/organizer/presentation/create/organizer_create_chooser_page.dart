import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/league_create/league_create_providers.dart';
import '../../domain/tournament_create/tournament_create_providers.dart';
import '../league_stage_create/league_picker_sheet.dart';
import '../league_create/league_create_navigation.dart';
import '../tournament_create/tournament_create_navigation.dart';

enum _CreateEventType { tournament, league }

class OrganizerCreateChooserPage extends ConsumerStatefulWidget {
  const OrganizerCreateChooserPage({super.key});

  @override
  ConsumerState<OrganizerCreateChooserPage> createState() =>
      _OrganizerCreateChooserPageState();
}

class _OrganizerCreateChooserPageState
    extends ConsumerState<OrganizerCreateChooserPage> {
  _CreateEventType _selected = _CreateEventType.tournament;

  Future<void> _continueTournament() async {
    final hasLocal = ref.read(hasMeaningfulLocalWizardSessionProvider);
    if (hasLocal) {
      final startFresh = await confirmStartFreshWizard(context);
      if (!mounted || startFresh == null) return;
      if (startFresh) {
        await ref.read(tournamentCreateWizardProvider.notifier).discardSession();
      } else {
        final step = ref.read(tournamentCreateCurrentStepProvider);
        context.pushNamed(routeNameForCreateStep(step));
        return;
      }
    }

    context.pushNamed(AppRouteNames.organizerTournamentCreateIdentity);
  }

  Future<void> _continueLeague() async {
    final hasLeagueLocal = ref.read(hasMeaningfulLocalLeagueWizardSessionProvider);
    if (hasLeagueLocal) {
      final startFresh = await confirmStartFreshLeagueWizard(context);
      if (!mounted || startFresh == null) return;
      if (startFresh) {
        await ref.read(leagueCreateWizardProvider.notifier).discardSession();
      } else {
        final step = ref.read(leagueCreateCurrentStepProvider);
        context.pushNamed(routeNameForLeagueCreateStep(step));
        return;
      }
    }

    context.pushNamed(AppRouteNames.organizerLeagueCreateIdentity);
  }

  Future<void> _continue() async {
    final hasTournamentLocal = ref.read(hasMeaningfulLocalWizardSessionProvider);
    final hasLeagueLocal = ref.read(hasMeaningfulLocalLeagueWizardSessionProvider);

    if (_selected == _CreateEventType.league) {
      if (hasTournamentLocal && hasLeagueLocal) {
        final choice = await confirmWizardTypeConflict(
          context,
          hasTournamentDraft: true,
          hasLeagueDraft: true,
        );
        if (!mounted || choice == null) return;
        if (choice) {
          await _continueLeague();
        } else {
          await _continueTournament();
        }
        return;
      }
      if (hasTournamentLocal) {
        final choice = await confirmWizardTypeConflict(
          context,
          hasTournamentDraft: true,
          hasLeagueDraft: false,
        );
        if (!mounted || choice == null) return;
        if (choice) {
          await _continueLeague();
        } else {
          await _continueTournament();
        }
        return;
      }
      await _continueLeague();
      return;
    }

    if (hasLeagueLocal && hasTournamentLocal) {
      final choice = await confirmWizardTypeConflict(
        context,
        hasTournamentDraft: true,
        hasLeagueDraft: true,
      );
      if (!mounted || choice == null) return;
      if (choice) {
        await _continueLeague();
      } else {
        await _continueTournament();
      }
      return;
    }
    if (hasLeagueLocal) {
      final choice = await confirmWizardTypeConflict(
        context,
        hasTournamentDraft: false,
        hasLeagueDraft: true,
      );
      if (!mounted || choice == null) return;
      if (choice) {
        await _continueLeague();
      } else {
        await _continueTournament();
      }
      return;
    }

    await _continueTournament();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
              child: Row(
                children: [
                  Material(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => context.pop(),
                      child: SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.arrow_back_rounded,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Novo evento',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 44),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 28, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'O que você quer criar?',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Defina o formato — dá pra mudar detalhes depois, antes de publicar.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.45,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 28),
                    _FormatOptionCard(
                      selected: _selected == _CreateEventType.tournament,
                      icon: Icons.emoji_events_outlined,
                      title: 'Torneio avulso',
                      badge: 'MAIS RÁPIDO',
                      description:
                          'Um evento único — normalmente um fim de semana. Categorias, chave e premiação próprias.',
                      example: 'EX: OPEN GOIÂNIA BEACH · 28-30 MAR',
                      onTap: () =>
                          setState(() => _selected = _CreateEventType.tournament),
                    ),
                    const SizedBox(height: 12),
                    _FormatOptionCard(
                      selected: _selected == _CreateEventType.league,
                      icon: Icons.flag_outlined,
                      title: 'Liga / Circuito',
                      description:
                          'Várias etapas ao longo do ano, com ranking geral somado e uma Grande Final.',
                      example: 'EX: COPA GOIÁS BEACH · 6 ETAPAS · FEV-OUT',
                      onTap: () =>
                          setState(() => _selected = _CreateEventType.league),
                    ),
                    const SizedBox(height: 28),
                    Row(
                      children: [
                        Expanded(
                          child: Divider(
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.2),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text(
                            'JÁ TEM UMA LIGA',
                            style: AppTypography.mono(
                              color: context.themeColors.onSurfaceMuted,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Divider(
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.2),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _SecondaryActionCard(
                      onTap: () => showLeaguePickerSheet(context, ref),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _continue,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _selected == _CreateEventType.tournament
                            ? 'Criar torneio avulso'
                            : 'Criar liga',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.add_rounded, size: 18),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FormatOptionCard extends StatelessWidget {
  const _FormatOptionCard({
    required this.selected,
    required this.icon,
    required this.title,
    required this.description,
    required this.example,
    required this.onTap,
    this.badge,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String? badge;
  final String description;
  final String example;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.18),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.brand
                      : context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  icon,
                  color: selected ? AppColors.black : AppColors.brand,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: selected
                                      ? AppColors.brand
                                      : context.themeColors.onSurface,
                                ),
                          ),
                        ),
                        if (badge != null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.brand.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              badge!,
                              style: AppTypography.mono(
                                color: AppColors.brand,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      description,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.45,
                          ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      example,
                      style: AppTypography.mono(
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected
                    ? Icons.check_circle_rounded
                    : Icons.circle_outlined,
                color: selected
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SecondaryActionCard extends StatelessWidget {
  const _SecondaryActionCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.18),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.add_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Adicionar etapa a uma liga',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Herda categorias, formato e ranking da liga.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.35,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
