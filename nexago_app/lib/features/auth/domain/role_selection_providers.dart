import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/app_mobile_role.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/auth/active_role_providers.dart';
import '../../arena/presentation/widgets/arena_selection_gate.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/athlete_public_profile_providers.dart';

/// Metadados exibidos no rodapé do card de seleção de papel.
final roleSelectionFooterProvider =
    FutureProvider.autoDispose.family<String?, AppMobileRole>((ref, role) async {
  switch (role) {
    case AppMobileRole.athlete:
      final uid = ref.watch(authProvider).valueOrNull?.uid;
      if (uid == null) return null;
      final ranking =
          await ref.watch(athletePublicRankingProvider(uid).future);
      if (ranking.hasRank) {
        return 'RANKING #${ranking.rank}';
      }
      return null;
    case AppMobileRole.arena:
      final arenas =
          ref.watch(managedArenasBriefProvider).valueOrNull ?? const [];
      if (arenas.isEmpty) return null;
      final first = arenas.first;
      if (arenas.length > 1) {
        return '${first.name.toUpperCase()} · ${arenas.length} ARENAS';
      }
      return first.name.toUpperCase();
    case AppMobileRole.organizer:
      return 'GESTÃO DE TORNEIOS EM BREVE NO APP';
  }
});

/// Primeiro nome do atleta para saudação.
final roleSelectionFirstNameProvider = Provider<String>((ref) {
  final user = ref.watch(authProvider).valueOrNull;
  final profile = ref.watch(athleteProfileProvider).valueOrNull;
  final raw = profile?.name.trim().isNotEmpty == true
      ? profile!.name.trim()
      : user?.displayName?.trim() ?? '';
  if (raw.isEmpty) return 'atleta';
  return raw.split(RegExp(r'\s+')).first;
});

final roleSelectionAvailableRolesProvider = Provider<List<AppMobileRole>>((ref) {
  return ref.watch(availableMobileRolesProvider).valueOrNull ?? const [];
});
