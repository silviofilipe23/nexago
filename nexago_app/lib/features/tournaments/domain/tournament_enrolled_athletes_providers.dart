import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/profiles/users_repository.dart';
import '../data/tournament_inscriptions_repository.dart';
import 'tournament_discovery_providers.dart';
import 'tournament_enrolled_athletes_logic.dart';

/// Equipes com inscrição confirmada no torneio (elenco + categoria).
///
/// Sobe só na subpágina Explorar → Equipes inscritas: 1 stream de
/// `inscriptions` + batch de `teams` (já no repo) + 1 batch de perfis por
/// emissão. A Visão geral não paga essa leitura.
final tournamentEnrolledTeamsProvider = StreamProvider.autoDispose
    .family<List<TournamentEnrolledTeam>, String>((ref, tournamentId) {
  final tid = tournamentId.trim();
  if (tid.isEmpty) return Stream.value(const []);

  final inscriptionsRepo = ref.watch(tournamentInscriptionsRepositoryProvider);
  final usersRepo = ref.watch(usersRepositoryProvider);

  return inscriptionsRepo.watchByTournament(tid).asyncMap((rows) async {
    final confirmed = rows
        .where((r) => isConfirmedTournamentInscription(r.inscription))
        .toList(growable: false);

    final tournament = await ref.read(tournamentDetailProvider(tid).future);
    final categories = tournament?.categoryOffers ?? const [];

    final uids = <String>{};
    for (final row in confirmed) {
      uids.addAll(
        inscriptionMemberUids(inscription: row.inscription, team: row.team),
      );
    }
    if (uids.isEmpty) return const <TournamentEnrolledTeam>[];

    final profiles = await usersRepo.getUsersByIds(uids);
    return buildTournamentEnrolledTeams(
      rows: confirmed,
      profiles: profiles,
      categories: categories,
    );
  });
});
