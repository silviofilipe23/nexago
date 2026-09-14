import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/ui/rebuild_at.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/category_filter.dart';
import '../../../domain/tournament_category_spots.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_listing_status.dart';
import 'tournament_categories_hero.dart';
import 'tournament_detail_category_card.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_tab_slivers.dart';

class TournamentDetailCategoriesTab extends StatefulWidget {
  const TournamentDetailCategoriesTab({
    super.key,
    required this.tournament,
    this.enrollmentByCategoryId = const {},
    this.enrollmentCountsResolved = false,
    this.registrationsByCategoryId = const {},
    this.waitlistByCategoryId = const {},
    this.canAccessTournaments = true,
    this.onRegisterBlocked,
    required this.onBack,
  });

  final TournamentDetail tournament;
  final Map<String, int> enrollmentByCategoryId;
  final bool enrollmentCountsResolved;
  final TournamentUserRegistrationsByCategory registrationsByCategoryId;
  final Map<String, bool> waitlistByCategoryId;
  final bool canAccessTournaments;
  final VoidCallback? onRegisterBlocked;

  /// A arte ocupa o header inteiro, então o voltar mora dentro do hero — a
  /// página é quem sabe para onde voltar.
  final VoidCallback onBack;

  @override
  State<TournamentDetailCategoriesTab> createState() =>
      _TournamentDetailCategoriesTabState();
}

class _TournamentDetailCategoriesTabState
    extends State<TournamentDetailCategoriesTab> {
  String _filterId = categoryFilterAllId;

  @override
  Widget build(BuildContext context) {
    final offers = widget.tournament.categoryOffers;

    final hero = TournamentCategoriesSliverHero(
      imageUrl: widget.tournament.imageUrl,
      onBack: widget.onBack,
    );

    if (offers.isEmpty) {
      return CustomScrollView(
        slivers: [
          hero,
          ...tournamentDetailTabSliversFromChildren(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            children: const [_EmptyCategories()],
          ),
        ],
      );
    }

    final filters = categoryFilterOptions(offers);
    final visible = applyCategoryFilter(offers, _filterId);

    return CustomScrollView(
      slivers: [
        hero,
        if (filters.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: TournamentDetailCategoryChips.fromOptions(
                options: [
                  for (final filter in filters)
                    (id: filter.id, name: filter.label),
                ],
                selectedId: _filterId,
                onSelected: (id) => setState(() => _filterId = id),
              ),
            ),
          ),
        ...tournamentDetailTabSliversFromBuilder(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          itemCount: visible.length,
          itemBuilder: (context, index) => _buildCard(context, visible[index]),
        ),
      ],
    );
  }

  Widget _buildCard(BuildContext context, TournamentCategoryOffer offer) {
    // Abertura agendada: cada card se acerta sozinho na hora marcada — só
    // os visíveis estão montados, e cada um gasta um único timer.
    return RebuildAt(
      instant: widget.tournament.registrationOpensAt,
      builder: (context, now) {
        // Card inteiro abre a visão da categoria (Partidas/Grupos/Chave),
        // como no portal; os botões internos continuam ganhando o toque.
        return GestureDetector(
          onTap: () => context.pushNamed(
            AppRouteNames.tournamentCategoryView,
            pathParameters: {
              'tournamentId': widget.tournament.id,
              'categoryId': offer.id,
            },
          ),
          child: TournamentDetailCategoryCard(
            offer: offer,
            tournamentId: widget.tournament.id,
            tournamentName: widget.tournament.name,
            tournamentStatus: widget.tournament.status,
            registrationNotYetOpen: tournamentRegistrationNotYetOpen(
              widget.tournament.registrationOpensAt,
              now: now,
            ),
            inscriptionCount: resolveInscriptionCountForOffer(
              widget.enrollmentByCategoryId,
              offer,
              countsResolved: widget.enrollmentCountsResolved,
            ),
            registration: widget.registrationsByCategoryId[offer.id],
            isOnWaitlist: widget.waitlistByCategoryId[offer.id] == true,
            onRegister: () {
              if (!widget.canAccessTournaments) {
                widget.onRegisterBlocked?.call();
                return;
              }
              context.pushNamed(
                AppRouteNames.tournamentRegistration,
                pathParameters: {'tournamentId': widget.tournament.id},
                queryParameters: {'categoryId': offer.id},
              );
            },
          ),
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
