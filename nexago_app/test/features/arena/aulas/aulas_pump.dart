import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_providers.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_attendance_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_charges_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_enroll_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_student_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_classes_page.dart';

import 'fake_arena_class_enrollment_repository.dart';
import 'fake_arena_class_repository.dart';

/// Plano Pro ativo (capability `aulas`).
const proActivePlan =
    ArenaPlanStatus(tier: ArenaPlanTier.pro, status: 'active');

/// Monta as telas de Aulas num GoRouter de verdade (a chamada faz `pop`).
Future<GoRouter> pumpAulas(
  WidgetTester tester, {
  required FakeArenaClassRepository repo,
  ArenaStaffRole role = ArenaStaffRole.recepcao,
  ArenaPlanStatus plan = proActivePlan,
  FakeArenaClassEnrollmentRepository? enrollmentRepo,
  Object? extra,
  String initial = '/arena/classes',
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
          path: '/', builder: (_, __) => const Scaffold(body: Text('raiz'))),
      GoRoute(
        path: AppRoutes.arenaClasses,
        name: AppRouteNames.arenaClasses,
        builder: (_, __) => const ArenaClassesPage(),
        routes: [
          GoRoute(
            path: 'session/:sessionId',
            name: AppRouteNames.arenaClassSession,
            builder: (_, state) => ArenaClassAttendancePage(
              sessionId: state.pathParameters['sessionId']!,
            ),
          ),
          GoRoute(
            path: 'student/:studentId',
            name: AppRouteNames.arenaClassStudent,
            builder: (_, state) => ArenaClassStudentPage(
              studentId: state.pathParameters['studentId']!,
              classId: state.uri.queryParameters['classId'],
            ),
          ),
          GoRoute(
            path: 'charges',
            name: AppRouteNames.arenaClassCharges,
            builder: (_, __) => const ArenaClassChargesPage(),
          ),
          GoRoute(
            path: 'enroll',
            name: AppRouteNames.arenaClassEnroll,
            builder: (_, state) => ArenaClassEnrollPage(
              seed: state.extra is ArenaClassEnrollSeed
                  ? state.extra! as ArenaClassEnrollSeed
                  : null,
            ),
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...arenaAccessOverrides(role),
        arenaClassRepositoryProvider.overrideWithValue(repo),
        arenaClassEnrollmentRepositoryProvider.overrideWithValue(
          enrollmentRepo ?? FakeArenaClassEnrollmentRepository(),
        ),
        arenaClassTodayKeyProvider.overrideWith((ref) => '2026-10-19'),
        // Segunda 19/10/2026, 17:40 — o "agora" do protótipo.
        arenaClassClockProvider.overrideWith(
          (ref) => Stream.value(DateTime(2026, 10, 19, 17, 40)),
        ),
        arenaClassSelectedDayProvider.overrideWith(
          (ref) => DateTime(2026, 10, 19),
        ),
        managedArenaPlanStatusProvider.overrideWith(
          (ref) => Stream.value(plan),
        ),
        managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  router.push(initial, extra: extra);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 400));
  return router;
}
