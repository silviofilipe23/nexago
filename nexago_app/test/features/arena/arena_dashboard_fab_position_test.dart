import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_now.dart';
import 'package:nexago_app/features/arena/domain/arena_now_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_dashboard_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_tokens.dart';

/// O "+" do Painel fica logo acima da cápsula da tab bar do shell.
///
/// Medido num iPhone 16 (393×852): a tab bar ocupa 55 pt no layout (é o
/// `padding.bottom` que o `Scaffold` do shell, com `extendBody`, entrega à
/// tela), a home indicator 34 pt, e o topo da cápsula fica a ~87 pt da borda.
/// O botão subia ~200 pt: somava a barra duas vezes. O `padding.bottom` da
/// tela (55) é diferente do `viewPadding` (34) de propósito — é o que o
/// shell entrega, e o cálculo não pode depender dele.
const _screen = Size(393, 852);
const _shellLayoutBottom = 55.0;

Future<Rect> _fabRect(
  WidgetTester tester, {
  required TargetPlatform platform,
  required double viewPaddingBottom,
}) async {
  tester.view.physicalSize = _screen;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final membership = const ArenaMembership(
    arenaId: 'a1',
    name: 'Arena',
    isOwner: false,
    role: ArenaStaffRole.gestor,
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ownedArenaMembershipsProvider.overrideWith(
          (ref) => Stream.value(const <ArenaMembership>[]),
        ),
        staffArenaMembershipsProvider.overrideWith(
          (ref) => Stream.value([membership]),
        ),
        arenaNowSnapshotProvider.overrideWith(
          (ref) => const AsyncValue<ArenaNowSnapshot>.loading(),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark.copyWith(platform: platform),
        home: MediaQuery(
          data: MediaQueryData(
            size: _screen,
            padding: const EdgeInsets.only(top: 59, bottom: _shellLayoutBottom),
            viewPadding: EdgeInsets.only(top: 59, bottom: viewPaddingBottom),
          ),
          child: const ArenaDashboardPage(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  return tester.getRect(find.byType(FloatingActionButton));
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  testWidgets('iOS: o + assenta logo acima da cápsula, não no meio da tela', (
    tester,
  ) async {
    final fab = await _fabRect(
      tester,
      platform: TargetPlatform.iOS,
      viewPaddingBottom: 34,
    );
    final fromBottom = _screen.height - fab.bottom;
    expect(fromBottom, closeTo(ArenaDashboardTokens.shellBottomNavHeight, 0.5));
    expect(fab.right, closeTo(_screen.width - 16, 0.5));
  });

  testWidgets('Android: soma o inset do sistema, como a própria barra', (
    tester,
  ) async {
    final fab = await _fabRect(
      tester,
      platform: TargetPlatform.android,
      viewPaddingBottom: 24,
    );
    final fromBottom = _screen.height - fab.bottom;
    expect(
      fromBottom,
      closeTo(ArenaDashboardTokens.shellBottomNavHeight + 24, 0.5),
    );
  });
}
