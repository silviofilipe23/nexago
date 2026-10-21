import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
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
    const professor = AppMobileRole.professor;

    test('modo Professor + vínculo ativo com "Reservar quadras"', () {
      expect(
        canOfferBookingAsProfessor(
          _link(ArenaProfessorLinkStatus.active),
          activeRole: professor,
        ),
        isTrue,
      );
      expect(
        canOfferBookingAsProfessor(null, activeRole: professor),
        isFalse,
      );
      expect(
        canOfferBookingAsProfessor(
          _link(ArenaProfessorLinkStatus.active, canBookCourts: false),
          activeRole: professor,
        ),
        isFalse,
      );
      for (final status in [
        ArenaProfessorLinkStatus.suspended,
        ArenaProfessorLinkStatus.invited,
        ArenaProfessorLinkStatus.pending,
        ArenaProfessorLinkStatus.ended,
      ]) {
        expect(
          canOfferBookingAsProfessor(_link(status), activeRole: professor),
          isFalse,
          reason: status.wire,
        );
      }
    });

    test('fora do modo Professor a reserva é sempre de atleta', () {
      for (final role in [
        AppMobileRole.athlete,
        AppMobileRole.arena,
        AppMobileRole.organizer,
        null,
      ]) {
        expect(
          canOfferBookingAsProfessor(
            _link(ArenaProfessorLinkStatus.active),
            activeRole: role,
          ),
          isFalse,
          reason: '$role',
        );
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
    expect(find.textContaining('Mesmo preço e regras'), findsOneWidget);
  });

  testWidgets('opção na confirmação: cita o desconto com a faixa do dia',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: BookingConfirmProfessorOption(
            arenaName: 'Arena Beach',
            type: ArenaProfessorLinkType.independent,
            value: true,
            onChanged: (_) {},
            courtDiscountLabel: '20% das 08:00 às 17:00',
          ),
        ),
      ),
    );

    expect(
      find.textContaining(
        'Desconto de 20% das 08:00 às 17:00 no aluguel, sobre o preço cheio.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Mesmo preço'), findsNothing);
  });
}
