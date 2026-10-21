import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../athlete/domain/agenda/teacher_class_roster.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_agenda.dart';
import '../domain/professor_lessons.dart';
import '../domain/professor_own_classes.dart'
    show professorOwnClassNextBooking;
import '../infrastructure/professor_agenda_repository.dart';
import 'professor_availability_providers.dart';
import 'professor_own_classes_providers.dart';
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

/// Reservas como professor no intervalo da visão: as ocorrências de turma
/// própria e a situação das aulas da carteira. Mesma consulta da carteira
/// (índice `athleteId + bookedAs + date`), com o intervalo da visão.
final professorAgendaBookingsProvider = StreamProvider.autoDispose
    .family<List<ProfessorCourtBooking>, ProfessorAgendaRange>((ref, range) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorWalletRepositoryProvider).watchProfessorBookings(
        uid,
        fromKey: range.fromKey,
        toKey: range.toKey,
      );
});

/// Nome de cada turma própria (o título da ocorrência na agenda).
final professorOwnClassNamesProvider =
    Provider.autoDispose<Map<String, String>>((ref) {
  final all = ref.watch(professorOwnClassesProvider).valueOrNull ?? const [];
  return {for (final c in all) c.id: c.name};
});

/// Quantos dias à frente o detalhe da turma própria procura a próxima aula.
const int kProfessorOwnClassNextDays = 28;

/// Próxima ocorrência da turma própria [classId] (o "Plano da aula" do
/// detalhe). `null` = nenhuma nas próximas 4 semanas (ou carregando).
final professorOwnClassNextBookingProvider = Provider.autoDispose
    .family<ProfessorCourtBooking?, String>((ref, classId) {
  final now = ref.watch(professorAgendaNowProvider);
  final range = (
    fromKey: now.todayKey,
    toKey: professorShiftDay(now.todayKey, kProfessorOwnClassNextDays - 1),
  );
  final bookings =
      ref.watch(professorAgendaBookingsProvider(range)).valueOrNull ??
          const <ProfessorCourtBooking>[];
  return professorOwnClassNextBooking(
    bookings,
    classId: classId,
    todayKey: now.todayKey,
    nowMin: now.nowMin,
  );
});

/// Itens do intervalo: aulas de turma + carteira + particulares do app +
/// turma própria + bloqueios. Espera as aulas de turma (o erro chega à
/// tela); o resto entra quando chega.
final professorAgendaItemsProvider = Provider.autoDispose
    .family<AsyncValue<List<ProfessorAgendaItem>>, ProfessorAgendaRange>(
        (ref, range) {
  final sessions = ref.watch(professorAgendaSessionsProvider(range));
  final lessons = ref.watch(professorLessonsProvider).valueOrNull ?? const [];
  final bookings =
      ref.watch(professorCourtBookingsProvider).valueOrNull ?? const [];
  final rangeBookings =
      ref.watch(professorAgendaBookingsProvider(range)).valueOrNull ??
          const <ProfessorCourtBooking>[];
  final ownNames = ref.watch(professorOwnClassNamesProvider);
  final blocks = ref.watch(professorBlocksProvider).valueOrNull ?? const [];
  final types = ref.watch(professorClassTypesProvider);
  final privates =
      ref.watch(professorPrivateLessonsProvider).valueOrNull ?? const [];
  return sessions.whenData((list) {
    final all = buildProfessorAgendaItems(
      sessions: list,
      lessons: lessons,
      bookingStatus: professorBookingStatusById([
        ...bookings,
        ...rangeBookings,
      ]),
      blocks: blocks,
      classTypes: types,
      privateLessons: privates,
      courtBookings: rangeBookings,
      ownClassNames: ownNames,
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
  final own = ref.watch(professorOwnClassesProvider).valueOrNull ?? const [];
  return professorArenaPalette([
    for (final l in links) l.arenaId,
    for (final a in snap?.arenas ?? const []) a.arenaId,
    for (final l in lessons) l.arenaId,
    for (final c in own) c.arenaId,
  ]);
});

/// Alunos de uma aula de turma (E4). Some quando a tela fecha.
final professorSessionRosterProvider = FutureProvider.autoDispose
    .family<TeacherClassRoster, String>((ref, sessionId) {
  return ref
      .watch(professorAgendaRepositoryProvider)
      .fetchSessionRoster(sessionId);
});
