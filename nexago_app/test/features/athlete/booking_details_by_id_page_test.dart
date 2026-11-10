import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/athlete/presentation/booking_details_by_id_page.dart';

void main() {
  testWidgets('push de reserva apagada mostra "Reserva não encontrada"',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          arenaBookingDocProvider.overrideWith((ref, id) => Stream.value(null)),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const BookingDetailsByIdPage(bookingId: 'sumiu'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Reserva não encontrada'), findsOneWidget);
  });
}
