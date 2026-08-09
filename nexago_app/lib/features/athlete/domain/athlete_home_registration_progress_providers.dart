import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/profiles/users_repository.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/domain/registration_progress_logic.dart';
import 'athlete_display_name.dart';
import 'athlete_profile_providers.dart';

/// Inscrições que ainda têm próximo passo (falta uniforme/dupla/pagamento) —
/// o card de acompanhamento no topo da Home. Sai da lista assim que a
/// inscrição fecha. Nomes dos parceiros vêm de `users`; falha ali não derruba
/// o card: sem nome, o passo Dupla cai em "Dupla formada".
final athleteHomeInProgressRegistrationsProvider =
    FutureProvider.autoDispose<List<RegistrationProgress>>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return const [];

  final registrations =
      await ref.watch(myTournamentRegistrationsProvider.future);
  if (registrations.isEmpty) return const [];

  final profile = ref.watch(athleteProfileProvider).valueOrNull;
  final myName = profile != null ? athleteDisplayName(profile) : 'Atleta';

  var partnerNames = const <String, String>{};
  final partnerUids = partnerUidsOf(registrations, uid);
  if (partnerUids.isNotEmpty) {
    try {
      final profiles =
          await ref.read(usersRepositoryProvider).getUsersByIds(partnerUids);
      partnerNames = {
        for (final entry in profiles.entries)
          entry.key: resolveAppUserDisplayName(entry.value),
      };
    } catch (_) {
      // Segue sem nomes.
    }
  }

  return buildInProgressRegistrations(
    registrations,
    myUid: uid,
    myName: myName,
    partnerNameByUid: partnerNames,
  );
});
