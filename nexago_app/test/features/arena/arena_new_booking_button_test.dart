// "Nova reserva" saiu do botão flutuante da aba Reservas para os headers
// (Reservas e Painel): mesma ação, abrir a agenda no dia escolhido.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_new_booking_button.dart';

List<Override> _role(ArenaStaffRole role) {
  final m = ArenaMembership(
    arenaId: 'a1',
    name: 'Arena',
    isOwner: false,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith((ref) => Stream.value([m])),
  ];
}

Future<ProviderContainer> _pump(
  WidgetTester tester,
  ArenaStaffRole role, {
  DateTime? day,
}) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(
          body: Center(child: ArenaNewBookingButton(day: day)),
        ),
      ),
      GoRoute(
        path: AppRoutes.arenaSchedule,
        builder: (_, __) => const Scaffold(body: Text('agenda')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: _role(role),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  return ProviderScope.containerOf(tester.element(find.byType(Scaffold)));
}

void main() {
  testWidgets('mantém o visual: pílula laranja, + e "Nova reserva" em preto',
      (tester) async {
    tester.view.physicalSize = const Size(402, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(tester, ArenaStaffRole.recepcao);
    expect(find.text('Nova reserva'), findsOneWidget);
    expect(find.byIcon(Icons.add_rounded), findsOneWidget);
    final style = tester.widget<FilledButton>(find.byType(FilledButton)).style!;
    expect(style.backgroundColor!.resolve({}), AppColors.brand);
    expect(style.foregroundColor!.resolve({}), AppColors.black);
    expect(style.shape!.resolve({}), isA<StadiumBorder>());
  });

  testWidgets('abre a agenda no dia escolhido', (tester) async {
    final container = await _pump(
      tester,
      ArenaStaffRole.recepcao,
      day: DateTime(2026, 11, 21, 15, 30),
    );
    await tester.tap(find.text('Nova reserva'));
    await tester.pumpAndSettle();
    expect(find.text('agenda'), findsOneWidget);
    expect(
      container.read(arenaScheduleSelectedDateProvider),
      DateTime(2026, 11, 21),
    );
  });

  testWidgets('sem dia, abre a agenda em hoje', (tester) async {
    final container = await _pump(tester, ArenaStaffRole.recepcao);
    await tester.tap(find.text('Nova reserva'));
    await tester.pumpAndSettle();
    final now = DateTime.now();
    expect(
      container.read(arenaScheduleSelectedDateProvider),
      DateTime(now.year, now.month, now.day),
    );
  });

  testWidgets('some para quem só lê a agenda', (tester) async {
    await _pump(tester, ArenaStaffRole.manutencao);
    expect(find.text('Nova reserva'), findsNothing);
  });

  testWidgets('tela estreita: mesma pílula só com o +, rótulo no tooltip',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(tester, ArenaStaffRole.recepcao);
    expect(find.text('Nova reserva'), findsNothing);
    expect(find.byTooltip('Nova reserva'), findsOneWidget);
    expect(find.byIcon(Icons.add_rounded), findsOneWidget);
    final style = tester.widget<FilledButton>(find.byType(FilledButton)).style!;
    expect(style.backgroundColor!.resolve({}), AppColors.brand);
  });
}
