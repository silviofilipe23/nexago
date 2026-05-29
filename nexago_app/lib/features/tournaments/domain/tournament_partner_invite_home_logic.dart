import '../data/tournament_registration_service.dart';
import 'tournament_partner_invite.dart';

/// Convite ainda relevante na seção Home «Inscrições em andamento».
bool tournamentPartnerInviteNeedsHomeAction({
  required TournamentPartnerInvite invite,
  required String currentUid,
  TournamentRegistrationSnapshot? registration,
}) {
  if (invite.isExpired) return false;
  if (invite.isCancelled || invite.isDeclined) return false;
  if (invite.isPending) return true;
  if (!invite.isAccepted) return false;

  final regId = invite.registrationId?.trim() ?? '';
  if (regId.isEmpty) return true;

  final reg = registration;
  if (reg == null) return false;

  if (reg.isPaid) return false;

  if (currentUid.isNotEmpty && reg.athleteSharePaid(currentUid)) {
    return false;
  }

  return true;
}

List<TournamentPartnerInvite> filterOngoingInvitesForHome({
  required List<TournamentPartnerInvite> invites,
  required String currentUid,
  required Map<String, TournamentRegistrationSnapshot?> registrationsById,
}) {
  return invites
      .where((invite) {
        final regId = invite.registrationId?.trim() ?? '';
        final registration =
            regId.isEmpty ? null : registrationsById[regId];
        return tournamentPartnerInviteNeedsHomeAction(
          invite: invite,
          currentUid: currentUid,
          registration: registration,
        );
      })
      .toList();
}
