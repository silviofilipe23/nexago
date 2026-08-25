import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/tournament_registration_service.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'tournament_registration_receipt.dart';
import 'tournament_registration_success_preferences_providers.dart';

/// Inscrições cuja tela de confirmação já foi exibida ou dispensada.
class TournamentRegistrationSuccessHandledIdsNotifier
    extends Notifier<Set<String>> {
  String? _uid;

  @override
  Set<String> build() {
    final auth = ref.watch(authProvider);
    final uid = auth.valueOrNull?.uid.trim() ?? '';
    _uid = uid.isEmpty ? null : uid;

    if (_uid == null) return <String>{};

    return ref
        .read(tournamentRegistrationSuccessPreferencesRepositoryProvider)
        .loadHandledIds(_uid!);
  }

  void markHandled(String registrationId) {
    final id = registrationId.trim();
    if (id.isEmpty || state.contains(id)) return;
    state = {...state, id};

    final uid = _uid;
    if (uid == null) return;
    ref
        .read(tournamentRegistrationSuccessPreferencesRepositoryProvider)
        .addHandledId(uid, id);
  }

  bool isHandled(String registrationId) {
    final id = registrationId.trim();
    return id.isNotEmpty && state.contains(id);
  }
}

final tournamentRegistrationSuccessHandledIdsProvider =
    NotifierProvider<TournamentRegistrationSuccessHandledIdsNotifier, Set<String>>(
  TournamentRegistrationSuccessHandledIdsNotifier.new,
);

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

/// Perfis públicos do elenco de uma inscrição, em lote — nome e foto para as
/// linhas do elenco. Falha vira mapa vazio: o elenco ainda aparece, com
/// "Você"/"Atleta" (ver `buildTeamRoster`).
final registrationRosterProfilesProvider = FutureProvider.autoDispose
    .family<Map<String, AppUserProfile>, List<String>>((ref, uids) async {
  if (uids.isEmpty) return const {};
  try {
    return await ref.read(usersRepositoryProvider).getUsersByIds(uids);
  } catch (_) {
    return const {};
  }
});
