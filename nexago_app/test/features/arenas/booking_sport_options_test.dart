import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';
import 'package:nexago_app/features/arenas/domain/arena_sport_codes.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_sport_picker.dart';

/// Esporte da reserva do atleta. Espelha `functions/src/arena-booking-sport.test.ts` e
/// `booking-sport-options.spec.ts` do portal do atleta.
void main() {
  group('bookingSportCode', () {
    test('código e rótulo legado viram o código do catálogo', () {
      expect(bookingSportCode('beachTennis'), 'beachTennis');
      expect(bookingSportCode('Beach tennis'), 'beachTennis');
      expect(bookingSportCode('Vôlei indoor'), 'indoorVolleyball');
    });

    test('pickleball segue como texto; superfície e vazio não são esporte', () {
      expect(bookingSportCode('pickleball'), 'Pickleball');
      expect(bookingSportCode('Areia'), isNull);
      expect(bookingSportCode('  '), isNull);
      expect(bookingSportCode(null), isNull);
    });
  });

  group('bookingSportOptions', () {
    test('esportes da quadra, sem repetir código e rótulo nem superfície', () {
      expect(
        bookingSportOptions(
          ['Beach tennis', 'beachTennis', 'Areia', 'Futevôlei'],
          ['Padel'],
        ),
        ['beachTennis', 'footvolley'],
      );
    });

    test('quadra sem esporte cadastrado cai nos da arena', () {
      expect(
        bookingSportOptions(['Areia'], ['Vôlei de praia', 'Padel']),
        ['beachVolleyball', 'padel'],
      );
    });

    test('nem quadra nem arena: a lista do cadastro de quadra', () {
      expect(
        bookingSportOptions(const [], const []),
        [for (final o in kCourtSportOptions) o.value],
      );
    });
  });

  test('arenaBookingSportLabel: rótulo do esporte gravado; sem esporte, null',
      () {
    expect(arenaBookingSportLabel({'sport': 'beachTennis'}), 'Beach tennis');
    expect(arenaBookingSportLabel({'sport': 'Pickleball'}), 'Pickleball');
    expect(arenaBookingSportLabel({'sport': null}), isNull);
    expect(arenaBookingSportLabel(const {}), isNull);
    expect(arenaBookingSportLabel(null), isNull);
  });

  testWidgets('seletor mostra os rótulos e devolve o código tocado', (
    tester,
  ) async {
    String? picked;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: BookingConfirmSportPicker(
            options: const ['beachTennis', 'beachVolleyball'],
            selected: null,
            onSelected: (code) => picked = code,
          ),
        ),
      ),
    );

    expect(find.text('ESPORTE'), findsOneWidget);
    expect(find.text('Beach tennis'), findsOneWidget);
    expect(find.text('Vôlei de praia'), findsOneWidget);
    expect(find.byIcon(Icons.check_rounded), findsNothing);

    await tester.tap(find.text('Vôlei de praia'));
    expect(picked, 'beachVolleyball');
  });

  testWidgets(
      'seletor marca o esporte escolhido e mostra carregando sem opções', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Column(
            children: [
              BookingConfirmSportPicker(
                options: const ['beachTennis'],
                selected: 'beachTennis',
                onSelected: (_) {},
              ),
              BookingConfirmSportPicker(
                options: null,
                selected: null,
                onSelected: (_) {},
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.byIcon(Icons.check_rounded), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
