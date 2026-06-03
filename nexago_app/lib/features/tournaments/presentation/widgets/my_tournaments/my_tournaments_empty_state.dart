import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_tournaments_logic.dart';
import '../../../domain/my_tournaments_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import 'my_tournaments_empty_suggested_card.dart';
import 'my_tournaments_section_header.dart';

class MyTournamentsEmptyState extends ConsumerWidget {
  const MyTournamentsEmptyState({super.key, required this.tab});

  final MyTournamentsTab tab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOngoing = tab == MyTournamentsTab.ongoing;
    final theme = Theme.of(context);
    final suggestions = isOngoing
        ? pickOpenTournamentSuggestions(
            ref.watch(discoveryTournamentsProvider).valueOrNull ??
                const [],
            limit: 3,
          )
        : const [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Column(
            children: [
              Stack(
                alignment: Alignment.center,
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: MyTournamentsTokens.gold.withValues(alpha: 0.35),
                          blurRadius: 28,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: MyTournamentsTokens.gold.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Icon(
                      Icons.emoji_events_outlined,
                      size: 30,
                      color: MyTournamentsTokens.gold,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 20),
              Text(
                isOngoing
                    ? 'Nenhum torneio em andamento'
                    : 'Nenhum torneio concluído',
                textAlign: TextAlign.center,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.3,
                ),
              ),
              SizedBox(height: 12),
              Text(
                isOngoing
                    ? 'Você não está inscrito em nenhum torneio ativo. '
                        'Encontre uma etapa perto de você e garanta sua vaga.'
                    : 'Torneios finalizados em que você participou aparecerão aqui.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.5,
                ),
              ),
              if (isOngoing) ...[
                SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () {
                      context.pushNamed(AppRouteNames.tournamentDiscoveryList);
                    },
                    icon: Icon(
                      Icons.search_rounded,
                      color: AppColors.black,
                      size: 20,
                    ),
                    label: Text(
                      'Explorar torneios',
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.black,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (isOngoing && suggestions.isNotEmpty) ...[
          SizedBox(height: 28),
          const MyTournamentsSectionHeader(
            label: 'INSCRIÇÕES ABERTAS • PERTO DE VOCÊ',
          ),
          for (final tournament in suggestions)
            MyTournamentsEmptySuggestedCard(
              tournament: tournament,
              onTap: () => _openTournament(context, tournament.id),
              onRegisterTap: () => _openTournament(context, tournament.id),
            ),
        ],
        SizedBox(height: 24),
      ],
    );
  }

  void _openTournament(BuildContext context, String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': id},
    );
  }
}
