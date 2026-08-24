import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../organizer/domain/match_ops/match_ops_providers.dart';
import '../../organizer/presentation/match_ops/organizer_match_navigation.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_providers.dart';
import 'focus/widgets/focus_match_card.dart';

/// J2 — Transmissão pública (read-only).
///
/// Reaproveita o card de partida do Modo Focus (fotos, placar por sets,
/// badge AO VIVO) em vez de um layout próprio: é o mesmo desenho, então
/// qualquer ajuste ali já reflete aqui.
class PublicMatchLivePage extends ConsumerWidget {
  const PublicMatchLivePage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  /// Nome da categoria pela oferta do torneio — mesmo padrão de
  /// `FocusArenaSection._categoryNameOf`.
  String _categoryNameOf(TournamentDetail tournament, String categoryId) {
    final id = categoryId.trim();
    if (id.isEmpty) return '';
    for (final offer in tournament.categoryOffers) {
      if (offer.id.trim() == id) return offer.name;
    }
    return '';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardsAsync = ref.watch(organizerMatchCardsByIdProvider(tournamentId));
    final tournament =
        ref.watch(tournamentDetailProvider(tournamentId)).valueOrNull;

    return Scaffold(
      appBar: NexaAppBar(
        title: Text(tournament?.name ?? 'Ao vivo'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_rounded),
            onPressed: () => nexaShareText(
              context,
              publicMatchLivePath(tournamentId, matchId),
            ),
          ),
        ],
      ),
      body: cardsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (cards) {
          final card = cards[matchId];
          if (card == null) {
            return const Center(child: Text('Partida não encontrada'));
          }
          final categoryName = tournament == null
              ? ''
              : _categoryNameOf(tournament, card.match.categoryId);
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.screenH),
              child:
                  FocusMatchCard(viewModel: card, categoryName: categoryName),
            ),
          );
        },
      ),
    );
  }
}
