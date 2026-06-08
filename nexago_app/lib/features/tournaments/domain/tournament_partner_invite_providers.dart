import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/tournament_partner_invite_service.dart';
import '../data/tournament_registration_service.dart';
import 'tournament_partner_invite.dart';
import 'tournament_partner_invite_home_logic.dart';

final tournamentPartnerInviteProvider =
    StreamProvider.autoDispose.family<TournamentPartnerInvite?, String>(
  (ref, inviteId) {
    if (inviteId.isEmpty) return Stream.value(null);
    return ref.watch(tournamentPartnerInviteServiceProvider).watchInvite(inviteId);
  },
);

final pendingTournamentPartnerInvitesProvider =
    StreamProvider.autoDispose<List<TournamentPartnerInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentPartnerInviteServiceProvider)
      .watchPendingForInvitee(uid);
});

final inviterTournamentPartnerInvitesProvider =
    StreamProvider.autoDispose<List<TournamentPartnerInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentPartnerInviteServiceProvider)
      .watchInvitesAsInviter(uid);
});

final inviteeAcceptedTournamentPartnerInvitesProvider =
    StreamProvider.autoDispose<List<TournamentPartnerInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentPartnerInviteServiceProvider)
      .watchAcceptedInvitesAsInvitee(uid);
});

final ongoingTournamentPartnerInvitesHomeProvider =
    StreamProvider.autoDispose<List<TournamentPartnerInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);

  final inviteService = ref.watch(tournamentPartnerInviteServiceProvider);
  final registrationService = ref.watch(tournamentRegistrationServiceProvider);

  return inviteService.watchOngoingForHome(uid).asyncExpand((invites) {
    final registrationIds = invites
        .where((invite) => invite.isAccepted)
        .map((invite) => invite.registrationId?.trim() ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();

    final registrationsStream = registrationIds.isEmpty
        ? Stream<Map<String, TournamentRegistrationSnapshot?>>.value(const {})
        : registrationService.watchRegistrationSnapshots(registrationIds);

    return registrationsStream.map(
      (registrationsById) => filterOngoingInvitesForHome(
        invites: invites,
        currentUid: uid,
        registrationsById: registrationsById,
      ),
    );
  });
});
