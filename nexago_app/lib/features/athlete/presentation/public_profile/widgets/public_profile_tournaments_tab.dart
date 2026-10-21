import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_public_profile_providers.dart';
import '../../widgets/match_history/match_history_tournament_card.dart';
import 'public_profile_tabs.dart';

/// Aba "Torneios" do perfil público: as campanhas do atleta (colocação e
/// V/D por torneio). Sai do mesmo histórico público da aba Partidas.
class PublicProfileTournamentsTab extends ConsumerWidget {
  const PublicProfileTournamentsTab({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(athletePublicMatchHistoryProvider(userId));
    return historyAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (_, __) => const PublicProfilePlaceholderTab(
        message: 'Não foi possível carregar os torneios.',
      ),
      data: (bundle) {
        if (bundle.tournaments.isEmpty) {
          return const PublicProfilePlaceholderTab(
            message: 'Nenhum torneio disputado ainda.',
          );
        }
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final t in bundle.tournaments)
                MatchHistoryTournamentCard(tournament: t),
            ],
          ),
        );
      },
    );
  }
}
