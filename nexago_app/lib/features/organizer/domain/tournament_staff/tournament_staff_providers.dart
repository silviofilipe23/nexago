import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/tournament_staff_repository.dart';
import 'tournament_staff_models.dart';

export 'tournament_staff_models.dart';

final tournamentStaffRepositoryProvider =
    Provider<TournamentStaffRepository>((ref) {
  return TournamentStaffRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
  );
});

final tournamentStaffProvider = StreamProvider.autoDispose
    .family<List<TournamentStaffMember>, String>((ref, tournamentId) {
  return ref
      .watch(tournamentStaffRepositoryProvider)
      .watchStaff(tournamentId);
});
