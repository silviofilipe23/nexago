import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_teacher.dart';

// Repasse do professor (fase 2b) — dados do protótipo da tela 15.

ArenaClassTeacherPayoutModel revenueShare(double percent) =>
    ArenaClassTeacherPayoutModel(
      kind: ArenaClassPayoutModelKind.revenueShare,
      percent: percent,
    );

ArenaClassTeacherPayoutModel perClass(double amount) =>
    ArenaClassTeacherPayoutModel(
      kind: ArenaClassPayoutModelKind.perClass,
      amountReais: amount,
    );

ArenaClassTeacherPayoutModel perStudent(double amount) =>
    ArenaClassTeacherPayoutModel(
      kind: ArenaClassPayoutModelKind.perStudent,
      amountReais: amount,
    );

ArenaClassTeacher teacher({
  String id = 't1',
  String name = 'Thiago Mendes',
  String status = 'active',
  String color = '#FF6A1A',
  String? userId = 'u-thiago',
  String? specialty = 'Beach Tennis',
  String? phone = '11999990000',
  ArenaClassTeacherPayoutModel? payout,
}) {
  return ArenaClassTeacher(
    id: id,
    name: name,
    color: color,
    status: status,
    userId: userId,
    specialty: specialty,
    phone: phone,
    payout: payout,
  );
}

ArenaClassPayoutFigures figures({
  ArenaClassTeacherPayoutModel? model,
  int classes = 0,
  int presences = 0,
  double revenue = 0,
}) {
  return ArenaClassPayoutFigures(
    teacherId: 't1',
    teacherName: 'Thiago Mendes',
    teacherColor: '#FF6A1A',
    model: model,
    classesGiven: classes,
    presences: presences,
    revenueReais: revenue,
  );
}

const ArenaClassPayoutLine _line = ArenaClassPayoutLine(
  key: 'c1',
  label: 'Iniciante A',
  detail: 'Turma · seg/qua',
  classes: 9,
  presences: 40,
  payingStudents: 8,
  revenueReais: 1920,
  amountReais: 960,
);

ArenaClassTeacherPayoutPreview previewTeacher({
  String id = 't1',
  String name = 'Thiago Mendes',
  double amount = 960,
  double revenue = 1920,
  int pending = 0,
  Object? model = _defaultModel,
  List<ArenaClassPayoutLine> lines = const [_line],
}) {
  return ArenaClassTeacherPayoutPreview(
    teacherId: id,
    teacherName: name,
    teacherColor: '#FF6A1A',
    model: identical(model, _defaultModel)
        ? revenueShare(50)
        : model as ArenaClassTeacherPayoutModel?,
    classesGiven: 9,
    presences: 40,
    students: 12,
    pendingSessions: pending,
    revenueReais: revenue,
    amountReais: amount,
    lines: lines,
  );
}

const Object _defaultModel = Object();

ArenaClassPayout payout({
  String teacherId = 't1',
  String name = 'Thiago Mendes',
  String month = '2026-10',
  double computed = 960,
  double? amount,
  double adjustment = 0,
  String? note,
  String status = 'closed',
  String? paidOn,
  ArenaClassPayoutMethod? method,
  ArenaClassTeacherPayoutModel? model,
  String? teacherUserId,
  bool paidViaNexago = false,
}) {
  return ArenaClassPayout(
    id: 'a1_${teacherId}_$month',
    arenaId: 'a1',
    month: month,
    teacherId: teacherId,
    teacherName: name,
    teacherColor: '#FF6A1A',
    model: model ?? revenueShare(50),
    classesGiven: 9,
    presences: 40,
    students: 12,
    revenueReais: 1920,
    computedReais: computed,
    adjustmentReais: adjustment,
    adjustmentNote: note,
    amountReais: amount ?? computed + adjustment,
    lines: const [_line],
    status: status,
    closedAt: DateTime(2026, 11, 1, 9),
    paidOn: paidOn,
    paymentMethod: method,
    teacherUserId: teacherUserId,
    paidViaNexago: paidViaNexago,
  );
}

ArenaClassPayoutPreview monthPreview(
  String month,
  List<ArenaClassTeacherPayoutPreview> teachers, {
  double revenue = 3200,
  double fees = 0,
  double unassigned = 0,
}) {
  return ArenaClassPayoutPreview(
    month: month,
    revenueReais: revenue,
    feesReais: fees,
    unassignedReais: unassigned,
    teachers: teachers,
  );
}
