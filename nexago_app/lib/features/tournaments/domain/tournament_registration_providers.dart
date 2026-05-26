import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/tournament_registration_service.dart';

final tournamentRegistrationSnapshotProvider =
    StreamProvider.autoDispose.family<TournamentRegistrationSnapshot?, String>(
  (ref, registrationId) {
    if (registrationId.isEmpty) return Stream.value(null);
    return ref
        .watch(tournamentRegistrationServiceProvider)
        .watchRegistration(registrationId);
  },
);
