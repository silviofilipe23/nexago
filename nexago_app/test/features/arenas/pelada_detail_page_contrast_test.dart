import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/pelada.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_detail_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/pelada/pelada_widgets.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'fake_booking_result_repository.dart';
import 'pelada_tone_contrast.dart';

Future<void> _open(
  WidgetTester tester,
  ThemeData theme, {
  required String uid,
  required SavedBookingResult saved,
}) async {
  tester.view.physicalSize = const Size(400, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(
          FakeBookingResultRepository([saved]),
        ),
        bookingResultUidProvider.overrideWithValue(uid),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        bookingStorySourceProvider('b1').overrideWith((ref) => null),
      ],
      child: MaterialApp(
        theme: theme,
        home: const PeladaDetailPage(bookingId: 'b1'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $name', () {
      testWidgets('duplas: hero, sets e reserva legíveis', (tester) async {
        final saved = savedResult();
        await _open(tester, theme, uid: 'u3', saved: saved);

        final checked = expectPeladaTonesLegible(
          tester,
          find.byType(PeladaDetailPage),
        );
        expect(
          checked,
          containsAll([
            peladaFormatLine(saved),
            peladaHeroSubtitle(peladaMineOf(saved, 'u3')!),
            'de 2',
            'SETS',
            'S1',
            // Pontos do time que perdeu cada set.
            '18',
            '17',
            '12',
            'Reserva ',
          ]),
        );
      });

      testWidgets('rei da quadra: classificação e seus jogos legíveis', (
        tester,
      ) async {
        final saved = savedResult(
          status: BookingResultStatus.confirmed,
          result: kingOfCourtResult(),
        );
        await _open(tester, theme, uid: 'u1', saved: saved);

        final checked = expectPeladaTonesLegible(
          tester,
          find.byType(PeladaDetailPage),
        );
        expect(
          checked,
          containsAll(['CLASSIFICAÇÃO', 'SEUS JOGOS', '2', '3', '4', 'J1']),
        );
        // O chevron da reserva (dono) é decorativo: conferido a 3:1.
        expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);
      });

      testWidgets('folha de contestar legível sobre a folha', (tester) async {
        await _open(tester, theme, uid: 'u3', saved: savedResult());

        await tester.tap(find.byKey(const Key('pelada-dispute')));
        await tester.pumpAndSettle();

        final checked = expectPeladaTonesLegible(
          tester,
          find.byType(PeladaDisputeSheet),
        );
        expect(checked.single, startsWith('Maria recebe o motivo'));
      });
    });
  }

  // O tema escuro é o visual de referência: o ajuste do claro não pode
  // mexer em nenhuma cor dele.
  test('tema escuro: dim e mute idênticos aos de antes', () {
    final dark = AppThemeColors.ofBrightness(Brightness.dark);
    expect(
      PeladaStyle.dim(dark),
      AppColors.onSurface.withValues(alpha: 0.55),
    );
    expect(
      PeladaStyle.mute(dark),
      AppColors.onSurface.withValues(alpha: 0.40),
    );
  });

  testWidgets('tema escuro: placar perdido em "Seus jogos" igual ao de antes', (
    tester,
  ) async {
    await _open(
      tester,
      AppTheme.dark,
      uid: 'u1',
      saved: savedResult(
        status: BookingResultStatus.confirmed,
        result: kingOfCourtResult(),
      ),
    );

    // J1: Maria & Enzo perderam de 18 a 21.
    final row = find.ancestor(
      of: find.text('J1'),
      matching: find.byType(Row),
    );
    final lost = tester.widget<Text>(
      find.descendant(of: row.first, matching: find.text('18')),
    );
    expect(lost.style!.color, AppColors.onSurface.withValues(alpha: 0.45));
  });
}
