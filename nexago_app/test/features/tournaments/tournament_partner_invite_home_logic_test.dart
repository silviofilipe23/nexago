import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_home_logic.dart';

void main() {
  // Relativo ao agora para o teste não "apodrecer" quando a data real passa
  // do prazo fixo (isExpired usa DateTime.now()).
  final createdAt = DateTime.now().subtract(const Duration(days: 1));
  final expiresAt = DateTime.now().add(const Duration(days: 30));

  final invitePending = TournamentPartnerInvite(
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'c1',
    inviterUid: 'u1',
    inviterName: 'A',
    inviteeUid: 'u2',
    inviteeName: 'B',
    status: 'pending',
    createdAt: createdAt,
    expiresAt: expiresAt,
  );

  final inviteAccepted = TournamentPartnerInvite(
    id: 'i2',
    tournamentId: 't1',
    categoryId: 'c1',
    inviterUid: 'u1',
    inviterName: 'A',
    inviteeUid: 'u2',
    inviteeName: 'B',
    status: 'accepted',
    registrationId: 'reg1',
    createdAt: createdAt,
    expiresAt: expiresAt,
  );

  const regUnpaid = TournamentRegistrationSnapshot(
    registrationId: 'reg1',
    isPaid: false,
    paidAmount: 0,
  );

  const regPaid = TournamentRegistrationSnapshot(
    registrationId: 'reg1',
    isPaid: true,
    paidAmount: 100,
  );

  const regInviterPaidShare = TournamentRegistrationSnapshot(
    registrationId: 'reg1',
    isPaid: false,
    paidAmount: 50,
    sharePaidUids: ['u1'],
  );

  group('tournamentPartnerInviteNeedsHomeAction', () {
    test('pending invite is shown', () {
      expect(
        tournamentPartnerInviteNeedsHomeAction(
          invite: invitePending,
          currentUid: 'u1',
        ),
        isTrue,
      );
    });

    test('accepted with fully paid registration is hidden', () {
      expect(
        tournamentPartnerInviteNeedsHomeAction(
          invite: inviteAccepted,
          currentUid: 'u1',
          registration: regPaid,
        ),
        isFalse,
      );
    });

    test('accepted when current athlete already paid share is hidden', () {
      expect(
        tournamentPartnerInviteNeedsHomeAction(
          invite: inviteAccepted,
          currentUid: 'u1',
          registration: regInviterPaidShare,
        ),
        isFalse,
      );
    });

    test('accepted unpaid registration still needs action', () {
      expect(
        tournamentPartnerInviteNeedsHomeAction(
          invite: inviteAccepted,
          currentUid: 'u1',
          registration: regUnpaid,
        ),
        isTrue,
      );
    });
  });

  group('filterOngoingInvitesForHome', () {
    test('removes paid registrations from list', () {
      final filtered = filterOngoingInvitesForHome(
        invites: [invitePending, inviteAccepted],
        currentUid: 'u1',
        registrationsById: {'reg1': regPaid},
      );
      expect(filtered, [invitePending]);
    });
  });
}
