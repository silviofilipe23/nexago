import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../athlete/domain/agenda/teacher_class_roster.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_agenda.dart';
import '../domain/professor_lessons.dart';
import '../infrastructure/professor_agenda_repository.dart';
import 'professor_students_providers.dart';
import 'professor_wallet_providers.dart';

export '../infrastructure/professor_agenda_repository.dart'
    show professorAgendaRepositoryProvider;

/// Agenda do professor (fase 5). A visão e o dia escolhidos ficam vivos
/// entre as abas.

final professorAgendaViewProvider =
    StateProvider<ProfessorAgendaView>((ref) => ProfessorAgendaView.day);

/// Dia escolhido (`null` = hoje).
final professorAgendaDateProvider = StateProvider<String?>((ref) => null);

/// Agora na parede de São Paulo: o dia e os minutos (AGORA, concluídas e a
/// linha da Semana).
final professorAgendaNowProvider =
    Provider.autoDispose<({String todayKey, int nowMin})>((ref) {
  final now = ref.watch(professorLinksClockProvider)();
  final local = toNexagoEventLocal(now);
  return (
    todayKey: nexagoEventDayKey(now),
    nowMin: local.hour * 60 + local.minute,
  );
});

final professorAgendaSelectedDateProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(professorAgendaDateProvider) ??
      ref.watch(professorAgendaNowProvider).todayKey;
});

/// Aulas de turma do intervalo (`getMyClassAgenda`, só as que ele dá).
final professorAgendaSessionsProvider = FutureProvider.autoDispose
    .family<List<ClassAgendaEntry>, ProfessorAgendaRange>((ref, range) {
  if (ref.watch(professorLinksUidProvider).isEmpty) {
    return Future.value(const []);
  }
  return ref
      .watch(professorAgendaRepositoryProvider)
      .fetchTeacherSessions(range);
});

final professorBlocksProvider =
    StreamProvider.autoDispose<List<ProfessorBlock>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorAgendaRepositoryProvider).watchBlocks(uid);
});

/// Tipo de cada turma (a callable da agenda não manda): da lista de alunos.
final professorClassTypesProvider =
    Provider.autoDispose<Map<String, ArenaClassType>>((ref) {
  final snap = ref.watch(professorStudentsProvider).valueOrNull;
  return {for (final c in snap?.classes ?? const []) c.classId: c.type};
});

/// Itens do intervalo: aulas de turma + carteira + bloqueios. Espera as
/// aulas de turma (o erro chega à tela); carteira e bloqueios entram quando
/// chegam.
final professorAgendaItemsProvider = Provider.autoDispose
    .family<AsyncValue<List<ProfessorAgendaItem>>, ProfessorAgendaRange>(
        (ref, range) {
  final sessions = ref.watch(professorAgendaSessionsProvider(range));
  final lessons = ref.watch(professorLessonsProvider).valueOrNull ?? const [];
  final bookings =
      ref.watch(professorCourtBookingsProvider).valueOrNull ?? const [];
  final blocks = ref.watch(professorBlocksProvider).valueOrNull ?? const [];
  final types = ref.watch(professorClassTypesProvider);
  return sessions.whenData((list) {
    final all = buildProfessorAgendaItems(
      sessions: list,
      lessons: lessons,
      bookingStatus: professorBookingStatusById(bookings),
      blocks: blocks,
      classTypes: types,
    );
    return [
      for (final i in all)
        if (i.date.compareTo(range.fromKey) >= 0 &&
            i.date.compareTo(range.toKey) <= 0)
          i,
    ];
  });
});

/// Cor de cada arena (índice da paleta), a mesma nas três visões: parte das
/// arenas que o professor conhece (vínculos, turmas e carteira), não do que
/// a visão carregou.
final professorArenaPaletteProvider =
    Provider.autoDispose<Map<String, int>>((ref) {
  final links = ref.watch(myProfessorLinksProvider).valueOrNull ?? const [];
  final snap = ref.watch(professorStudentsProvider).valueOrNull;
  final lessons = ref.watch(professorLessonsProvider).valueOrNull ?? const [];
  return professorArenaPalette([
    for (final l in links) l.arenaId,
    for (final a in snap?.arenas ?? const []) a.arenaId,
    for (final l in lessons) l.arenaId,
  ]);
});

/// Alunos de uma aula de turma (E4). Some quando a tela fecha.
final professorSessionRosterProvider = FutureProvider.autoDispose
    .family<TeacherClassRoster, String>((ref, sessionId) {
  return ref
      .watch(professorAgendaRepositoryProvider)
      .fetchSessionRoster(sessionId);
});
