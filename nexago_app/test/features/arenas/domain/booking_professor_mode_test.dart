import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_professor_mode.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_professor_option.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';

ArenaProfessorLink _link(
  ArenaProfessorLinkStatus status, {
  bool canBookCourts = true,
}) =>
    ArenaProfessorLink(
      id: 'arena1_u1',
      arenaId: 'arena1',
      professorUserId: 'u1',
      type: ArenaProfessorLinkType.independent,
      status: status,
      permissions: ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: canBookCourts,
        canAppearInArenaProfile: false,
      ),
    );

void main() {
  group('canOfferBookingAsProfessor', () {
    test('só com vínculo ativo e "Reservar quadras" ligada', () {
      expect(
        canOfferBookingAsProfessor(_link(ArenaProfessorLinkStatus.active)),
        isTrue,
      );
      expect(canOfferBookingAsProfessor(null), isFalse);
      expect(
        canOfferBookingAsProfessor(
          _link(ArenaProfessorLinkStatus.active, canBookCourts: false),
        ),
        isFalse,
      );
      for (final status in [
        ArenaProfessorLinkStatus.suspended,
        ArenaProfessorLinkStatus.invited,
        ArenaProfessorLinkStatus.pending,
        ArenaProfessorLinkStatus.ended,
      ]) {
        expect(canOfferBookingAsProfessor(_link(status)), isFalse,
            reason: status.wire);
      }
    });
  });

  testWidgets('opção na confirmação: explica e alterna', (tester) async {
    var value = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => BookingConfirmProfessorOption(
              arenaName: 'Arena Beach',
              type: ArenaProfessorLinkType.independent,
              value: value,
              onChanged: (v) => setState(() => value = v),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Reservar como professor'), findsOneWidget);
    expect(find.text('INDEPENDENTE'), findsOneWidget);
    expect(
      find.textContaining('A Arena Beach vê na agenda'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('booking-confirm-as-professor')));
    await tester.pump();
    expect(value, isTrue);
    await tester.tap(find.byType(Switch));
    await tester.pump();
    expect(value, isFalse);
  });
}
