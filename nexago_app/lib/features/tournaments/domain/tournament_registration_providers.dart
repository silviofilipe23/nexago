import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/tournament_registration_service.dart';
import '../data/users_repository.dart';
import 'app_user_profile.dart';
import 'tournament_registration_receipt.dart';

final tournamentRegistrationSnapshotProvider =
    StreamProvider.autoDispose.family<TournamentRegistrationSnapshot?, String>(
  (ref, registrationId) {
    if (registrationId.isEmpty) return Stream.value(null);
    return ref
        .watch(tournamentRegistrationServiceProvider)
        .watchRegistration(registrationId);
  },
);

final tournamentRegistrationReceiptProvider =
    FutureProvider.autoDispose.family<TournamentRegistrationReceipt?, String>(
  (ref, registrationId) async {
    final id = registrationId.trim();
    if (id.isEmpty) return null;

    final raw = await ref
        .read(tournamentRegistrationServiceProvider)
        .loadRegistrationTeam(id);
    if (raw == null) return null;

    final users = ref.read(usersRepositoryProvider);
    final p1 = await users.getUserById(raw.player1Id);
    final p2 = await users.getUserById(raw.player2Id);

    String nameFor(String uid, AppUserProfile? profile) {
      if (profile != null) {
        final label = appUserDisplayName(profile);
        if (label.isNotEmpty) return label;
      }
      return 'Atleta';
    }

    return TournamentRegistrationReceipt(
      registrationId: raw.registrationId,
      categoryId: raw.categoryId,
      player1Name: nameFor(raw.player1Id, p1),
      player2Name: nameFor(raw.player2Id, p2),
      player1AvatarUrl: p1?.profilePhotoUrl,
      player2AvatarUrl: p2?.profilePhotoUrl,
      isPaid: raw.isPaid,
      registeredAt: raw.registeredAt,
    );
  },
);
