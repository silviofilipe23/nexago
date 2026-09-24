import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import 'arena_staff_role.dart';

/// Vinculo do usuario logado com uma arena — como dono (`managerUserId`) ou
/// como membro de equipe (`users/{uid}/arenaStaff/{arenaId}`, espelho mantido
/// pela Cloud Function `onArenaStaffWrittenSyncMirror`).
class ArenaMembership {
  const ArenaMembership({
    required this.arenaId,
    required this.name,
    required this.isOwner,
    this.role,
  });

  final String arenaId;
  final String name;
  final bool isOwner;

  /// Cargo na equipe; `null` para o dono, que nao tem cargo.
  final ArenaStaffRole? role;

  bool canRead(ArenaArea area) {
    if (isOwner) return true;
    final r = role;
    return r != null && arenaRoleCanRead(r, area);
  }

  bool canWrite(ArenaArea area) {
    if (isOwner) return true;
    final r = role;
    return r != null && arenaRoleCanWrite(r, area);
  }
}

/// Une dono e equipe. Se a mesma arena vier das duas fontes, o vinculo de dono
/// vence — dono tem acesso total e nao pode ser rebaixado por um cargo.
List<ArenaMembership> mergeArenaMemberships({
  required List<ArenaMembership> owned,
  required List<ArenaMembership> staff,
}) {
  final byId = <String, ArenaMembership>{};
  for (final m in staff) {
    byId[m.arenaId] = m;
  }
  for (final m in owned) {
    byId[m.arenaId] = m;
  }
  final list = byId.values.toList(growable: false)
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return list;
}

/// Arenas em que o usuario e dono.
final ownedArenaMembershipsProvider =
    StreamProvider<List<ArenaMembership>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream.value(const <ArenaMembership>[]);
  }
  return ref
      .watch(firestoreProvider)
      .collection('arenas')
      .where('managerUserId', isEqualTo: uid)
      .limit(30)
      .snapshots()
      .map((snap) => snap.docs
          .map((doc) => ArenaMembership(
                arenaId: doc.id,
                name: (doc.data()['name'] as String?)?.trim() ?? '',
                isOwner: true,
              ))
          .toList(growable: false));
});

/// Arenas em que o usuario e equipe ATIVA. Le o espelho, nunca
/// `arenas/{id}/staff` — a query por `managerUserId` jamais traria estas, e o
/// espelho e a unica fonte que o cliente alcanca (`firestore.rules:1883`).
final staffArenaMembershipsProvider =
    StreamProvider<List<ArenaMembership>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream.value(const <ArenaMembership>[]);
  }
  return ref
      .watch(firestoreProvider)
      .collection('users/$uid/arenaStaff')
      .snapshots()
      .map((snap) {
    final list = <ArenaMembership>[];
    for (final doc in snap.docs) {
      final data = doc.data();
      if ((data['status'] as String?) != 'active') continue;
      final role = arenaStaffRoleFromValue(data['role'] as String?);
      if (role == null) continue;
      list.add(ArenaMembership(
        arenaId: doc.id,
        name: (data['arenaName'] as String?)?.trim() ?? '',
        isOwner: false,
        role: role,
      ));
    }
    return list;
  });
});

/// Todos os vinculos do usuario. Fica em `loading` ate as DUAS fontes
/// emitirem: e o que impede a UI de decidir acesso com metade da resposta.
/// Erro numa fonte vira lista vazia daquela fonte — a outra continua valendo,
/// e a fronteira de verdade sao as rules, nao esta tela.
final arenaMembershipsProvider =
    Provider<AsyncValue<List<ArenaMembership>>>((ref) {
  final owned = ref.watch(ownedArenaMembershipsProvider);
  final staff = ref.watch(staffArenaMembershipsProvider);
  if (owned.isLoading || staff.isLoading) {
    return const AsyncValue<List<ArenaMembership>>.loading();
  }
  return AsyncValue.data(mergeArenaMemberships(
    owned: owned.valueOrNull ?? const [],
    staff: staff.valueOrNull ?? const [],
  ));
});
