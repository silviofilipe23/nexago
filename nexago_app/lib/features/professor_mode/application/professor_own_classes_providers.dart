import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/slots_providers.dart' show courtsStreamProvider;
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../domain/professor_own_classes.dart';
import '../infrastructure/professor_own_classes_repository.dart';

export '../infrastructure/professor_own_classes_repository.dart'
    show professorOwnClassesRepositoryProvider;

/// Turmas próprias do professor (B10), em tempo real. Sem login, vazio.
final professorOwnClassesProvider =
    StreamProvider.autoDispose<List<ProfessorOwnClass>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorOwnClassesRepositoryProvider).watchOwnClasses(uid);
});

/// Uma turma própria pelo id (`null` = não existe ou ainda carregando).
final professorOwnClassProvider =
    Provider.autoDispose.family<AsyncValue<ProfessorOwnClass?>, String>(
  (ref, classId) => ref.watch(professorOwnClassesProvider).whenData((all) {
    for (final c in all) {
      if (c.id == classId) return c;
    }
    return null;
  }),
);

/// Arenas onde o professor pode criar turma própria (`null` = carregando).
final professorOwnClassArenasProvider =
    Provider.autoDispose<List<ArenaProfessorLink>?>((ref) {
  final links = ref.watch(myProfessorLinksProvider).valueOrNull;
  return links == null ? null : professorOwnClassArenas(links);
});

/// Vínculos independentes ativos sem a chave de horário fixo.
final professorOwnClassLockedArenasProvider =
    Provider.autoDispose<List<ArenaProfessorLink>>((ref) {
  final links = ref.watch(myProfessorLinksProvider).valueOrNull ?? const [];
  return professorOwnClassLockedArenas(links);
});

/// Quadras da arena para a turma: as em manutenção ficam de fora.
final professorOwnClassCourtsProvider = Provider.autoDispose
    .family<AsyncValue<List<ArenaCourt>>, String>((ref, arenaId) {
  if (arenaId.isEmpty) return const AsyncValue.data([]);
  return ref.watch(courtsStreamProvider(arenaId)).whenData(
        (courts) => [
          for (final c in courts)
            if (!c.isMaintenance) c,
        ],
      );
});
