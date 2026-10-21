import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_own_classes.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_own_classes_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/own_classes/professor_own_class_new_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/own_classes/professor_own_class_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show professorLink, professorTestNow;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

/// Apoio dos testes da turma própria (B10): vínculos independentes, a turma
/// realista, o dublê do repositório (estado em memória + chamadas gravadas)
/// e o app mínimo com as rotas reais. Hoje é 20/10/2026.

const ownArenaId = 'arena-norte';

/// Independente ativo na Arena Norte, com ou sem "Horário fixo".
ArenaProfessorLink independentLink({
  String arenaId = ownArenaId,
  String arenaName = 'Arena Norte',
  bool canBookRecurring = true,
  ArenaProfessorLinkStatus status = ArenaProfessorLinkStatus.active,
}) =>
    professorLink(
      arenaId: arenaId,
      arenaName: arenaName,
      type: ArenaProfessorLinkType.independent,
      status: status,
      permissions: ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: false,
        canBookRecurring: canBookRecurring,
      ),
    );

List<ArenaCourt> ownCourts() => const [
      ArenaCourt(id: 'q1', name: 'Quadra 1', basePricePerHourReais: 60),
      ArenaCourt(id: 'q2', name: 'Quadra 2', basePricePerHourReais: 80),
      ArenaCourt(
        id: 'q3',
        name: 'Quadra 3',
        status: ArenaCourtStatus.maintenance,
      ),
    ];

ProfessorOwnClass ownClass({
  String id = 'oc-1',
  String name = 'Manhã Intermediário',
  List<int> weekdays = const [2, 4],
  int capacity = 4,
  double price = 260,
  List<String> studentIds = const [],
  ProfessorOwnClassStatus status = ProfessorOwnClassStatus.active,
  String? endedReason,
}) =>
    ProfessorOwnClass(
      id: id,
      name: name,
      arenaId: ownArenaId,
      arenaName: 'Arena Norte',
      courtId: 'q1',
      courtName: 'Quadra 1',
      weekdays: weekdays,
      startTime: '07:00',
      endTime: '08:00',
      capacity: capacity,
      monthlyPriceReais: price,
      pricePerOccurrenceReais: 60,
      startDate: '2026-10-20',
      studentIds: studentIds,
      status: status,
      endedReason: endedReason,
    );

/// Prévia do protótipo: 8,7 aulas/mês na Quadra 1 a R$ 60/h, turma de 4 a
/// R$ 260.
ProfessorOwnClassPreview ownPreview({List<String> conflicts = const []}) =>
    ProfessorOwnClassPreview(
      arenaName: 'Arena Norte',
      courtName: 'Quadra 1',
      hourlyReais: 60,
      pricePerOccurrenceReais: 60,
      occurrencesPerMonth: 8.7,
      courtMonthlyReais: 522,
      revenueFullReais: 1040,
      netEstimateReais: 518,
      conflicts: conflicts,
    );

typedef OwnClassCall = ({String name, Object? data});

class FakeProfessorOwnClassesRepository
    implements ProfessorOwnClassesRepository {
  FakeProfessorOwnClassesRepository({
    List<ProfessorOwnClass>? classes,
    ProfessorOwnClassPreview? preview,
    this.createdDates = const ['2026-10-22', '2026-10-27', '2026-10-29'],
    this.skippedDates = const [],
  })  : classes = classes ?? [],
        previewResult = preview ?? ownPreview();

  List<ProfessorOwnClass> classes;
  ProfessorOwnClassPreview previewResult;
  List<String> createdDates;
  List<String> skippedDates;

  /// Faz toda callable falhar com a mensagem.
  String? error;
  final calls = <OwnClassCall>[];
  final _changes = StreamController<void>.broadcast();

  void emit() => _changes.add(null);

  Iterable<OwnClassCall> callsOf(String name) =>
      calls.where((c) => c.name == name);

  Future<void> _record(String name, Object? data) async {
    calls.add((name: name, data: data));
    final e = error;
    if (e != null) throw ProfessorStudentsException(e);
  }

  ProfessorOwnClass _copy(
    ProfessorOwnClass c, {
    List<String>? studentIds,
    ProfessorOwnClassStatus? status,
    String? endedReason,
  }) =>
      ProfessorOwnClass(
        id: c.id,
        name: c.name,
        arenaId: c.arenaId,
        arenaName: c.arenaName,
        courtId: c.courtId,
        courtName: c.courtName,
        weekdays: c.weekdays,
        startTime: c.startTime,
        endTime: c.endTime,
        capacity: c.capacity,
        monthlyPriceReais: c.monthlyPriceReais,
        pricePerOccurrenceReais: c.pricePerOccurrenceReais,
        startDate: c.startDate,
        studentIds: studentIds ?? c.studentIds,
        status: status ?? c.status,
        endedReason: endedReason ?? c.endedReason,
      );

  @override
  Stream<List<ProfessorOwnClass>> watchOwnClasses(String uid) async* {
    yield List.of(classes);
    await for (final _ in _changes.stream) {
      yield List.of(classes);
    }
  }

  @override
  Future<ProfessorOwnClassPreview> preview(ProfessorOwnClassInput input) async {
    await _record('preview', input.toPayload());
    return previewResult;
  }

  @override
  Future<ProfessorOwnClassCreated> create(ProfessorOwnClassInput input) async {
    await _record('create', input.toPayload());
    final id = 'oc-new-${classes.length}';
    classes = [
      ...classes,
      ProfessorOwnClass(
        id: id,
        name: input.name,
        arenaId: input.arenaId,
        arenaName: 'Arena Norte',
        courtId: input.courtId,
        courtName: 'Quadra 1',
        weekdays: input.weekdays,
        startTime: input.startTime,
        endTime: input.endTime,
        capacity: input.capacity,
        monthlyPriceReais: input.monthlyPriceReais,
      ),
    ];
    emit();
    return ProfessorOwnClassCreated(
      classId: id,
      createdDates: createdDates,
      skippedDates: skippedDates,
    );
  }

  @override
  Future<void> end(String classId) async {
    await _record('end', classId);
    classes = [
      for (final c in classes)
        c.id == classId
            ? _copy(
                c,
                status: ProfessorOwnClassStatus.ended,
                endedReason: 'professor_ended',
              )
            : c,
    ];
    emit();
  }

  @override
  Future<void> setStudents(String classId, List<String> athleteIds) async {
    await _record('setStudents', {'classId': classId, 'ids': athleteIds});
    classes = [
      for (final c in classes)
        c.id == classId ? _copy(c, studentIds: List.of(athleteIds)) : c,
    ];
    emit();
  }
}

/// Rotas da turma própria (+ as da carteira, para a cobrança).
List<RouteBase> get professorOwnClassRoutes => [
      GoRoute(
        path: AppRoutes.professorOwnClassNew,
        name: AppRouteNames.professorOwnClassNew,
        builder: (_, state) => ProfessorOwnClassNewPage(
          arenaId: state.uri.queryParameters['arenaId'],
        ),
      ),
      GoRoute(
        path: AppRoutes.professorOwnClass,
        name: AppRouteNames.professorOwnClass,
        builder: (_, state) => ProfessorOwnClassPage(
          classId: state.pathParameters['classId'] ?? '',
        ),
      ),
      ...professorWalletRoutes,
    ];

/// Abre o app numa tela da turma própria. [initialStack] empilha telas antes.
Future<GoRouter> pumpOwnClassesApp(
  WidgetTester tester, {
  required String location,
  FakeProfessorOwnClassesRepository? repo,
  FakeProfessorWalletRepository? wallet,
  List<ArenaProfessorLink>? links,
  List<ArenaCourt>? courts,
  List<String> initialStack = const [],
}) async {
  final router = await pumpProfessorStudentsApp(
    tester,
    repo: FakeProfessorStudentsRepository([
      professorStudentsSnapshot(classes: const []),
    ]),
    ownClassesRepo: repo ?? FakeProfessorOwnClassesRepository(),
    walletRepo: wallet ?? FakeProfessorWalletRepository(),
    location: initialStack.isEmpty ? location : initialStack.first,
    extraRoutes: professorOwnClassRoutes,
    overrides: [
      professorLinksClockProvider.overrideWithValue(() => professorTestNow),
      myProfessorLinksProvider.overrideWith(
        (ref) => Stream.value(links ?? [independentLink()]),
      ),
      courtsStreamProvider.overrideWith(
        (ref, arenaId) => Stream.value(courts ?? ownCourts()),
      ),
    ],
  );
  if (initialStack.isNotEmpty) {
    for (final l in [...initialStack.skip(1), location]) {
      router.push(l);
      await settleProfessorStudents(tester);
    }
  }
  return router;
}
