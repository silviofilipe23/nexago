import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/auth/domain/role_selection_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/application/professor_mode_providers.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_home_page.dart';

final _now = DateTime(2026, 10, 20, 12);

ClassAgendaEntry _entry(Map<String, Object?> over) => ClassAgendaEntry.fromMap({
      'sessionId': 'class_c1_2026-10-20',
      'arenaId': 'arena1',
      'arenaName': 'Arena CFC',
      'classId': 'c1',
      'className': 'Intermediário B',
      'teacherName': 'Thiago',
      'courtName': 'Quadra 2',
      'date': '2026-10-20',
      'startTime': '19:00',
      'endTime': '20:00',
      'status': 'scheduled',
      'role': 'teacher',
      'kind': 'regular',
      'studentCount': 6,
      'canManageLessons': true,
      ...over,
    });

ArenaProfessorLink _link(
  String arenaId,
  String name, {
  bool canBookCourts = true,
}) =>
    ArenaProfessorLink(
      id: '${arenaId}_u1',
      arenaId: arenaId,
      professorUserId: 'u1',
      type: ArenaProfessorLinkType.independent,
      status: ArenaProfessorLinkStatus.active,
      arenaName: name,
      permissions: ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: canBookCourts,
        canAppearInArenaProfile: false,
      ),
    );

Future<void> _pump(
  WidgetTester tester, {
  Future<List<ClassAgendaEntry>> Function()? classes,
  List<ArenaProfessorLink> links = const [],
}) async {
  tester.view.physicalSize = const Size(430, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const ProfessorHomePage()),
      GoRoute(
        path: AppRoutes.professorClassAttendance,
        name: AppRouteNames.professorClassAttendance,
        builder: (_, state) => Scaffold(
          body: Text('chamada ${state.pathParameters['sessionId']}'),
        ),
      ),
      GoRoute(
        path: AppRoutes.arenaSlots,
        name: AppRouteNames.arenaSlots,
        builder: (_, state) => Scaffold(
          body: Text('horários ${state.pathParameters['arenaId']}'),
        ),
      ),
      GoRoute(
        path: AppRoutes.professorArenas,
        name: AppRouteNames.professorArenas,
        builder: (_, __) => const Scaffold(body: Text('minhas arenas')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorClassesProvider.overrideWith(
          (ref) => classes?.call() ?? Future.value(const []),
        ),
        myProfessorLinksProvider.overrideWith((ref) => Stream.value(links)),
        professorLinksClockProvider.overrideWithValue(() => _now),
        roleSelectionFirstNameProvider.overrideWithValue('Thiago'),
        hasMultipleMobileRolesProvider.overrideWithValue(true),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('aula de hoje com a chamada liberada leva à chamada',
      (tester) async {
    await _pump(
      tester,
      classes: () async => [
        _entry({}),
        _entry({
          'sessionId': 'class_c2_2026-10-20',
          'className': 'Iniciante',
          'startTime': '07:00',
          'endTime': '08:00',
          'canManageLessons': false,
        }),
        _entry({
          'sessionId': 'class_c3_2026-10-20',
          'className': 'Avançado',
          'startTime': '09:00',
          'endTime': '10:00',
          'status': 'canceled',
        }),
      ],
    );

    expect(find.text('Olá, Thiago'), findsOneWidget);
    expect(find.text('Intermediário B'), findsOneWidget);
    expect(find.text('Arena CFC · Quadra 2 · 6 alunos'), findsWidgets);
    // Sem a permissão: explica, sem botão. Cancelada: só o aviso.
    expect(
      find.text('A arena não liberou a chamada pelo app no seu vínculo.'),
      findsOneWidget,
    );
    expect(find.text('CANCELADA'), findsOneWidget);
    expect(find.text('Fazer chamada'), findsOneWidget);

    await tester.tap(find.text('Fazer chamada'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('chamada class_c1_2026-10-20'), findsOneWidget);
  });

  testWidgets('chamada pendente de outro dia e próximas aulas', (tester) async {
    await _pump(
      tester,
      classes: () async => [
        _entry({'sessionId': 'past', 'date': '2026-10-18'}),
        _entry({'sessionId': 'next', 'date': '2026-10-22'}),
      ],
    );
    expect(find.text('Nenhuma aula sua hoje.'), findsOneWidget);
    expect(find.text('CHAMADA PENDENTE'), findsOneWidget);
    expect(
      find.byKey(const Key('professor-class-cta-past')),
      findsOneWidget,
    );
    expect(find.text('PRÓXIMAS AULAS'), findsOneWidget);
    await tester.tap(find.byKey(const Key('professor-upcoming-next')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('chamada next'), findsOneWidget);
  });

  testWidgets('reservar: arenas que liberam "Reservar quadras"',
      (tester) async {
    await _pump(
      tester,
      links: [
        _link('a2', 'Arena Norte'),
        _link('a3', 'Arena Sem Reserva', canBookCourts: false),
      ],
    );
    expect(find.text('Arena Norte'), findsOneWidget);
    expect(find.text('Arena Sem Reserva'), findsNothing);
    await tester.tap(find.byKey(const Key('professor-book-a2')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('horários a2'), findsOneWidget);
  });

  testWidgets('sem arena para reservar e Minhas arenas', (tester) async {
    await _pump(tester);
    expect(
      find.byKey(const Key('professor-home-no-booking')),
      findsOneWidget,
    );
    await tester
        .ensureVisible(find.byKey(const Key('professor-home-my-arenas')));
    await tester.tap(find.byKey(const Key('professor-home-my-arenas')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('minhas arenas'), findsOneWidget);
  });

  testWidgets('erro ao carregar as aulas não vira "nenhuma aula"',
      (tester) async {
    await _pump(tester, classes: () => Future.error(Exception('offline')));
    await tester.pump(const Duration(milliseconds: 50));
    expect(
      find.text(
        'Não foi possível carregar suas aulas. Toque para tentar de novo.',
      ),
      findsOneWidget,
    );
    expect(find.text('Nenhuma aula sua hoje.'), findsNothing);
  });

  testWidgets('ajustes: Minhas arenas, Trocar papel e Sair', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('professor-home-settings')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(
      find.byKey(const Key('professor-settings-arenas')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('professor-settings-switch-role')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('professor-settings-sign-out')),
      findsOneWidget,
    );
  });
}
