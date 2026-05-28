import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/tournament_detail_model.dart';
import 'tournament_detail_category_card.dart';

class TournamentDetailCategoriesTab extends StatelessWidget {
  const TournamentDetailCategoriesTab({
    super.key,
    required this.tournament,
    this.enrollmentByCategoryId = const {},
    this.registrationsByCategoryId = const {},
    this.canAccessTournaments = true,
    this.onRegisterBlocked,
  });

  final TournamentDetail tournament;
  final Map<String, int> enrollmentByCategoryId;
  final Map<String, String> registrationsByCategoryId;
  final bool canAccessTournaments;
  final VoidCallback? onRegisterBlocked;

  @override
  Widget build(BuildContext context) {
    final offers = tournament.categoryOffers;

    if (offers.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: const [
          _EmptyCategories(),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      itemCount: offers.length,
      itemBuilder: (context, index) {
        final offer = offers[index];
        return TournamentDetailCategoryCard(
          offer: offer,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          tournamentStatus: tournament.status,
          inscriptionCount: inscriptionCountForCategory(
            enrollmentByCategoryId,
            offer.id,
          ),
          registrationId: registrationsByCategoryId[offer.id],
          onRegister: () {
            if (!canAccessTournaments) {
              onRegisterBlocked?.call();
              return;
            }
            context.pushNamed(
              AppRouteNames.tournamentRegistration,
              pathParameters: {'tournamentId': tournament.id},
              queryParameters: {'categoryId': offer.id},
            );
          },
        );
      },
    );
  }
}

class _EmptyCategories extends StatelessWidget {
  const _EmptyCategories();

  @override
  Widget build(BuildContext context) {
    return Text(
      'Categorias serão publicadas em breve pelo organizador.',
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
    );
  }
}
