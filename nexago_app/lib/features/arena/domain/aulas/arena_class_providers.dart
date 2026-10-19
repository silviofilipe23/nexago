import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../data/arena_class_repository.dart';
import '../arena_date_utils.dart';
import '../arena_schedule_providers.dart';
import 'arena_class.dart';
import 'arena_class_logic.dart';
import 'arena_class_session.dart';

final arenaClassRepositoryProvider = Provider<ArenaClassRepository>((ref) {
  return ArenaClassRepository(ref.watch(firestoreProvider));
});

/// Relógio das Aulas: agora, reemitido a cada 30 s para "AGORA" e
/// "concluída" virarem sozinhos com a tela aberta.
final arenaClassClockProvider =
    StreamProvider.autoDispose<DateTime>((ref) async* {
  yield DateTime.now();
  yield* Stream<DateTime>.periodic(
    const Duration(seconds: 30),
    (_) => DateTime.now(),
  );
});

/// Abas da tela de Aulas no app (fase 1: só Hoje e Turmas).
enum ArenaClassesTab { today, classes }

final arenaClassesTabProvider =
    StateProvider.autoDispose<ArenaClassesTab>((ref) => ArenaClassesTab.today);

/// Dia escolhido no seletor da semana (sem hora). Volta para hoje ao reabrir.
final arenaClassSelectedDayProvider =
    StateProvider.autoDispose<DateTime>((ref) => arenaTodayDateOnly());

/// Turmas e aulas avulsas da arena gerida (tempo real, todas as situações).
final managedArenaClassesProvider =
    StreamProvider.autoDispose<List<ArenaClass>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaClass>>.value(const []);
      }
      return ref.watch(arenaClassRepositoryProvider).watchClasses(arenaId);
    },
    loading: () => const Stream<List<ArenaClass>>.empty(),
    error: (_, __) => Stream<List<ArenaClass>>.value(const []),
  );
});

/// Aulas da arena gerida num dia `YYYY-MM-DD` (tempo real).
final arenaClassSessionsOnDayProvider = StreamProvider.autoDispose
    .family<List<ArenaClassSession>, String>((ref, dateKey) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaClassSession>>.value(const []);
      }
      return ref
          .watch(arenaClassRepositoryProvider)
          .watchSessionsOn(arenaId, dateKey);
    },
    loading: () => const Stream<List<ArenaClassSession>>.empty(),
    error: (_, __) => Stream<List<ArenaClassSession>>.value(const []),
  );
});

/// Visão do dia (seções + KPIs). O nº de alunos vem das turmas; enquanto
/// elas carregam, a lista já aparece com o que a aula sabe.
final arenaClassDayViewProvider = Provider.autoDispose
    .family<AsyncValue<ArenaClassDayView>, String>((ref, dateKey) {
  final sessions = ref.watch(arenaClassSessionsOnDayProvider(dateKey));
  final classes = ref.watch(managedArenaClassesProvider).valueOrNull ??
      const <ArenaClass>[];
  final now = ref.watch(arenaClassClockProvider).valueOrNull ?? DateTime.now();
  return sessions.whenData(
    (list) => buildArenaClassDayView(
      sessions: list,
      classesById: {for (final c in classes) c.id: c},
      now: now,
    ),
  );
});

/// Uma aula (tempo real).
final arenaClassSessionProvider = StreamProvider.autoDispose
    .family<ArenaClassSession?, String>((ref, sessionId) {
  return ref.watch(arenaClassRepositoryProvider).watchSession(sessionId);
});

/// Chave dos alunos de uma turma — a query precisa do `arenaId` por causa da
/// rule. Record de Strings: igualdade por valor, seguro como family.
typedef ArenaClassStudentsKey = ({String arenaId, String classId});

/// Alunos da turma (ativos e removidos) em tempo real.
final arenaClassStudentsProvider = StreamProvider.autoDispose
    .family<List<ArenaClassStudent>, ArenaClassStudentsKey>((ref, key) {
  return ref.watch(arenaClassRepositoryProvider).watchStudents(
        arenaId: key.arenaId,
        classId: key.classId,
      );
});
