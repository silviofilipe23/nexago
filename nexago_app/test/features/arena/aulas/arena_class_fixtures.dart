import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';

/// Aula de teste. Sem `startAt` o início sai de `date + startTime` no relógio
/// local — os testes usam `DateTime` local para `now`, então batem.
ArenaClassSession session({
  String id = 's1',
  String classId = 'c1',
  String className = 'Vôlei Avançado',
  String date = '2026-10-19',
  String start = '18:00',
  String end = '19:30',
  String status = 'scheduled',
  int capacity = 12,
  ArenaClassType type = ArenaClassType.turma,
  Map<String, AttendanceMark> attendance = const {},
  ArenaClassCancelReason? cancelReason,
  DateTime? startAt,
}) {
  return ArenaClassSession(
    id: id,
    classId: classId,
    arenaId: 'a1',
    className: className,
    type: type,
    sport: 'volei_praia',
    level: ArenaClassLevel.avancado,
    teacherName: 'Marcos Lima',
    teacherColor: '#2BD17E',
    courtName: 'Quadra 3',
    capacity: capacity,
    date: date,
    startTime: start,
    endTime: end,
    startAt: startAt,
    status: status,
    attendance: attendance,
    cancelReason: cancelReason,
  );
}

ArenaClass arenaClass({
  String id = 'c1',
  String name = 'Vôlei Avançado',
  List<int> weekdays = const [1, 3, 5],
  String start = '18:00',
  String end = '19:30',
  int capacity = 12,
  int studentCount = 10,
  String status = 'active',
  String startDate = '2026-10-01',
  List<String> conflictDates = const [],
  ArenaClassType type = ArenaClassType.turma,
}) {
  return ArenaClass(
    id: id,
    arenaId: 'a1',
    name: name,
    type: type,
    sport: 'volei_praia',
    level: ArenaClassLevel.avancado,
    teacherId: 't1',
    teacherName: 'Marcos Lima',
    teacherColor: '#2BD17E',
    weekdays: weekdays,
    startTime: start,
    endTime: end,
    courtId: 'q3',
    courtName: 'Quadra 3',
    capacity: capacity,
    studentCount: studentCount,
    startDate: startDate,
    status: status,
    conflictDates: conflictDates,
  );
}

ArenaClassStudent student(
  String id,
  String name, {
  String status = 'active',
  String? athleteId,
}) {
  return ArenaClassStudent(
    id: id,
    classId: 'c1',
    athleteId: athleteId,
    name: name,
    status: status,
  );
}
