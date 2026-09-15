import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/ui/rebuild_at.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/category_filter.dart';
import '../../../domain/tournament_category_spots.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_listing_status.dart';
import '../../../domain/tournament_match.dart';
import 'tournament_categories_hero.dart';
import 'tournament_detail_category_card.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_tab_slivers.dart';

class TournamentDetailCategoriesTab extends ConsumerStatefulWidget {
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
  ConsumerState<TournamentDetailCategoriesTab> createState() =>
      _TournamentDetailCategoriesTabState();
}

class _TournamentDetailCategoriesTabState
    extends ConsumerState<TournamentDetailCategoriesTab> {
  String _filterId = categoryFilterAllId;

  @override
  Widget build(BuildContext context) {
    final offers = widget.tournament.categoryOffers;
    // Mesmo stream da visão/chave — Riverpod compartilha; sem leitura extra
    // no Firestore. Só marca "AO VIVO" por categoria.
    final matches =
        ref
            .watch(tournamentMatchCardsProvider(widget.tournament.id))
            .valueOrNull
            ?.map((c) => c.match)
            .toList() ??
        const <TournamentMatch>[];

    final hero = TournamentCategoriesSliverHero(onBack: widget.onBack);

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
          itemBuilder: (context, index) =>
              _buildCard(context, visible[index], matches),
        ),
      ],
    );
  }

  Widget _buildCard(
    BuildContext context,
    TournamentCategoryOffer offer,
    List<TournamentMatch> matches,
  ) {
    // Abertura agendada: cada card se acerta sozinho na hora marcada — só
    // os visíveis estão montados, e cada um gasta um único timer.
    return RebuildAt(
      instant: widget.tournament.registrationOpensAt,
      builder: (context, now) {
        // Card abre a visão da categoria; o CTA interno (Inscreva-se etc.)
        // ganha o gesto na arena e não dispara a navegação do card.
        return TournamentDetailCategoryCard(
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
          hasLiveMatch: categoryHasInProgressMatch(matches, offer),
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
