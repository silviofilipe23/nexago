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
        final mine = peladaMineOf(saved, 'u3')!;
        expect(mine.balance, isNegative);
        expect(
          checked,
          containsAll([
            peladaFormatLine(saved),
            peladaHeroSubtitle(mine),
            // Selo âmbar e saldo vermelho sobre o gradiente laranja.
            peladaStatusTag(saved).label,
            'saldo ${peladaBalanceLabel(mine.balance)}',
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
        final mine = peladaMineOf(saved, 'u1')!;
        expect(
          checked,
          containsAll([
            'CLASSIFICAÇÃO',
            'SEUS JOGOS',
            '2',
            '3',
            '4',
            'J1',
            // Selo e saldo verdes sobre o gradiente laranja.
            '● CONFIRMADO',
            'saldo ${peladaBalanceLabel(mine.balance)}',
          ]),
        );
        // O chevron da reserva (dono) é decorativo: conferido a 3:1.
        expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);

        // Faixa verde/vermelha de cada jogo de "Seus jogos" contra o card.
        expect(
          expectPeladaMarksVisible(tester, find.byType(PeladaDetailPage)),
          List.filled(peladaMyGames(saved, 'u1').length, 'faixa'),
        );
      });

      testWidgets('contestada: selo, saldo e aviso legíveis', (tester) async {
        final saved = savedResult(
          status: BookingResultStatus.disputed,
          disputedBy: 'u3',
          disputeReason: 'Placar errado',
        );
        await _open(tester, theme, uid: 'u1', saved: saved);

        final checked = expectPeladaTonesLegible(
          tester,
          find.byType(PeladaDetailPage),
        );
        final mine = peladaMineOf(saved, 'u1')!;
        expect(mine.balance, isPositive);
        expect(
          checked,
          containsAll([
            '✕ CONTESTADO',
            'saldo ${peladaBalanceLabel(mine.balance)}',
          ]),
        );
        // O ícone do aviso é do tom de contestado, então entrou na conta
        // (a 3:1, sobre o vermelho translúcido do aviso).
        final icon = tester.widget<Icon>(find.byIcon(Icons.report_outlined));
        expect(
          icon.color,
          PeladaStyle.toneColor(
            PeladaStatusTone.disputed,
            isDark: theme.brightness == Brightness.dark,
          ),
        );
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
  test('tema escuro: paleta idêntica à de antes', () {
    final dark = AppThemeColors.ofBrightness(Brightness.dark);
    expect(
      PeladaStyle.dim(dark),
      AppColors.onSurface.withValues(alpha: 0.55),
    );
    expect(
      PeladaStyle.mute(dark),
      AppColors.onSurface.withValues(alpha: 0.40),
    );
    expect(PeladaStyle.win(dark), AppColors.win);
    expect(PeladaStyle.live(dark), AppColors.live);
    expect(PeladaStyle.pendingBorder(dark), const Color(0x40F4C543));
    expect(
      [
        for (final tone in PeladaStatusTone.values)
          PeladaStyle.toneColor(tone, isDark: true),
      ],
      [AppColors.win, AppColors.pending, AppColors.live],
    );
  });

  testWidgets('tema escuro: tons do detalhe iguais aos de antes', (
    tester,
  ) async {
    final saved = savedResult(
      status: BookingResultStatus.disputed,
      disputedBy: 'u3',
      disputeReason: 'Placar errado',
    );
    await _open(tester, AppTheme.dark, uid: 'u1', saved: saved);

    Color? colorOf(String text) =>
        tester.widget<Text>(find.text(text)).style!.color;
    final mine = peladaMineOf(saved, 'u1')!;
    expect(colorOf('✕ CONTESTADO'), AppColors.live);
    expect(
      colorOf('saldo ${peladaBalanceLabel(mine.balance)}'),
      AppColors.win,
    );
    expect(
      tester.widget<Icon>(find.byIcon(Icons.report_outlined)).color,
      AppColors.live,
    );
  });

  testWidgets('tema escuro: faixas de "Seus jogos" iguais às de antes', (
    tester,
  ) async {
    final saved = savedResult(
      status: BookingResultStatus.confirmed,
      result: kingOfCourtResult(),
    );
    await _open(tester, AppTheme.dark, uid: 'u1', saved: saved);

    final stripes = {
      for (final box in tester.widgetList<ColoredBox>(
        find.descendant(
          of: find.byType(PeladaDetailPage),
          matching: find.byType(ColoredBox),
        ),
      ))
        box.color,
    };
    expect(stripes, containsAll([AppColors.win, AppColors.live]));
    expect(find.text('● CONFIRMADO'), findsOneWidget);
    expect(
      tester.widget<Text>(find.text('● CONFIRMADO')).style!.color,
      AppColors.win,
    );
  });

  testWidgets('tema escuro: linha da lista igual à de antes', (tester) async {
    final saved = savedResult();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: PeladaSessionRow(saved: saved, uid: 'u1', onTap: () {}),
        ),
      ),
    );

    final card = tester.widget<Material>(
      find
          .descendant(
            of: find.byType(PeladaSessionRow),
            matching: find.byType(Material),
          )
          .first,
    );
    expect(
      (card.shape! as RoundedRectangleBorder).side.color,
      const Color(0x40F4C543),
    );
    final record = tester.widget<RichText>(
      find
          .descendant(
            of: find.byType(PeladaRecord),
            matching: find.byType(RichText),
          )
          .first,
    );
    final label = '${peladaMineOf(saved, 'u1')!.wins}V';
    TextSpan? wins;
    record.text.visitChildren((span) {
      if (span is TextSpan && span.text == label) wins = span;
      return wins == null;
    });
    expect(wins?.style?.color, AppColors.win);
    expect(
      tester.widget<Text>(find.text(peladaStatusTag(saved).label)).style!.color,
      AppColors.pending,
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
