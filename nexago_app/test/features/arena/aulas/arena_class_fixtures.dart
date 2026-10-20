import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment.dart';
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
  Map<String, ArenaClassExtra> extras = const {},
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
    extras: extras,
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
  String teacherId = 't1',
}) {
  return ArenaClass(
    id: id,
    arenaId: 'a1',
    name: name,
    type: type,
    sport: 'volei_praia',
    level: ArenaClassLevel.avancado,
    teacherId: teacherId,
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
  String classId = 'c1',
  List<int>? weekdays,
  String? enrollmentId,
  String? planName,
  String? photoUrl,
}) {
  return ArenaClassStudent(
    id: id,
    classId: classId,
    athleteId: athleteId,
    name: name,
    status: status,
    weekdays: weekdays,
    enrollmentId: enrollmentId,
    planName: planName,
    photoUrl: photoUrl,
  );
}

ArenaClassExtra extra(
  String studentId,
  String name, {
  ArenaClassExtraKind kind = ArenaClassExtraKind.makeup,
  String? creditId = 'cr1',
  String? athleteId,
}) {
  return ArenaClassExtra(
    studentId: studentId,
    name: name,
    kind: kind,
    creditId: kind == ArenaClassExtraKind.makeup ? creditId : null,
    athleteId: athleteId,
  );
}

ArenaClassPlan plan({
  String id = 'm2',
  String name = 'Mensal 2x/semana',
  ArenaClassPlanKind kind = ArenaClassPlanKind.monthly,
  double price = 320,
  int? perWeek = 2,
  int? makeups = 2,
  int? credits,
  int? validityDays,
  String status = 'active',
}) {
  return ArenaClassPlan(
    id: id,
    name: name,
    kind: kind,
    priceReais: price,
    classesPerWeek: kind == ArenaClassPlanKind.monthly ? perWeek : null,
    makeupsPerMonth: kind == ArenaClassPlanKind.monthly ? makeups : null,
    credits: credits,
    validityDays: validityDays,
    status: status,
  );
}

ArenaClassEnrollment enrollment({
  String id = 'e1',
  String studentId = 'u1',
  String? athleteId = 'u1',
  String name = 'Carla Dias',
  String? phone = '62999998888',
  ArenaClassPlan? withPlan,
  List<ArenaClassEnrollmentSlot> slots = const [
    ArenaClassEnrollmentSlot(
      classId: 'c1',
      weekday: 1,
      className: 'Iniciante A',
      startTime: '07:00',
    ),
    ArenaClassEnrollmentSlot(
      classId: 'c1',
      weekday: 3,
      className: 'Iniciante A',
      startTime: '07:00',
    ),
  ],
  String status = 'active',
  int dueDay = 5,
  String startDate = '2026-09-01',
  int? creditsLeft,
  String? expiresOn,
  ArenaClassBillingMode billingMode = ArenaClassBillingMode.manual,
  String? cpfMasked,
  String? photoUrl,
}) {
  return ArenaClassEnrollment(
    id: id,
    arenaId: 'a1',
    studentId: studentId,
    athleteId: athleteId,
    name: name,
    phone: phone,
    photoUrl: photoUrl,
    plan: withPlan ?? plan(),
    slots: slots,
    status: status,
    dueDay: dueDay,
    paymentMethod: ArenaClassPaymentMethod.pix,
    billingMode: billingMode,
    cpfMasked: cpfMasked,
    startDate: startDate,
    creditsLeft: creditsLeft,
    expiresOn: expiresOn,
  );
}

ArenaClassCharge charge({
  String id = 'ch1',
  String studentId = 'u1',
  String name = 'Carla Dias',
  String? phone = '62999998888',
  String description = 'Mensal 2x/semana · out/2026',
  double amount = 320,
  String dueDate = '2026-10-05',
  String status = 'open',
  String? paidOn,
  ArenaClassPaymentMethod method = ArenaClassPaymentMethod.pix,
  ArenaClassChargeAsaas? asaas,
  String? paidVia,
  String? onlineBillingType,
}) {
  return ArenaClassCharge(
    id: id,
    arenaId: 'a1',
    enrollmentId: 'e1',
    studentId: studentId,
    name: name,
    phone: phone,
    description: description,
    amountReais: amount,
    dueDate: dueDate,
    status: status,
    paidOn: paidOn,
    paymentMethod: method,
    billingMode: asaas == null
        ? ArenaClassBillingMode.manual
        : ArenaClassBillingMode.asaas,
    asaas: asaas,
    paidVia: paidVia,
    onlineBillingType: onlineBillingType,
  );
}

/// Espelho da fatura online (`asaas`) de uma mensalidade.
ArenaClassChargeAsaas invoice({
  String groupId = 'e1_first',
  ArenaClassAsaasState state = ArenaClassAsaasState.open,
  String? url = 'https://asaas.test/i/1',
  String? status = 'PENDING',
}) =>
    ArenaClassChargeAsaas(
      groupId: groupId,
      state: state,
      invoiceUrl: url,
      status: status,
    );

ArenaClassCredit credit({
  String id = 'cr1',
  String studentId = 'u9',
  String name = 'Igor Martins',
  String classId = 'c1',
  String expiresOn = '2026-11-13',
  String status = 'available',
}) {
  return ArenaClassCredit(
    id: id,
    arenaId: 'a1',
    studentId: studentId,
    name: name,
    classId: classId,
    reason: ArenaClassCreditReason.excused,
    sourceSessionId: 'class_${classId}_2026-10-14',
    sourceDate: '2026-10-14',
    status: status,
    expiresOn: expiresOn,
  );
}
