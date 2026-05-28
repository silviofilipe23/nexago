import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/tournament_partner_invite_service.dart';
import 'tournament_partner_invite.dart';

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

final ongoingTournamentPartnerInvitesHomeProvider =
    StreamProvider.autoDispose<List<TournamentPartnerInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentPartnerInviteServiceProvider)
      .watchOngoingForHome(uid);
});
