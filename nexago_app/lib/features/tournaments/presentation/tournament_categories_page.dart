import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_detail_categories_tab.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';

class TournamentCategoriesPage extends ConsumerWidget {
  const TournamentCategoriesPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));

    return tournamentAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      ),
      error: (e, _) => TournamentDetailSubpageScaffold(
        title: 'Categorias',
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Não foi possível carregar as categorias.\n$e'),
            ),
          ),
        ],
      ),
      data: (tournament) {
        if (tournament == null) {
          return const TournamentDetailSubpageScaffold(
            title: 'Categorias',
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Torneio não encontrado.'),
                ),
              ),
            ],
          );
        }

        final enrollmentAsync = ref.watch(
          tournamentCategoryEnrollmentCountsProvider(tournamentId),
        );
        final enrollment =
            enrollmentAsync.valueOrNull ?? const <String, int>{};
        final registrationsAsync = ref.watch(
          tournamentUserRegistrationsByCategoryProvider(tournamentId),
        );
        final waitlistAsync = ref.watch(
          tournamentUserWaitlistByCategoryProvider(tournamentId),
        );
        final access = ref.watch(tournamentAccessStateProvider);

        return TournamentDetailSubpageScaffold(
          title: 'Categorias',
          slivers: TournamentDetailCategoriesTab(
            tournament: tournament,
            enrollmentByCategoryId: enrollment,
            enrollmentCountsResolved: enrollmentAsync.hasValue,
            registrationsByCategoryId:
                registrationsAsync.valueOrNull ?? const {},
            waitlistByCategoryId: waitlistAsync.valueOrNull ?? const {},
            canAccessTournaments: access.canAccess,
            onRegisterBlocked: () {},
          ).buildSlivers(context),
        );
      },
    );
  }
}
