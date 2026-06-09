import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../../../../arenas/domain/booking_providers.dart';
import '../../../../arenas/domain/my_booking_confirmed_athlete.dart';
import '../../../../arenas/domain/my_booking_item.dart';
import 'booking_details_view_model.dart';

class BookingDetailsTeamMember {
  const BookingDetailsTeamMember({
    required this.displayName,
    required this.subtitle,
    required this.initials,
    this.avatarUrl,
    this.isOrganizer = false,
    this.isConfirmed = true,
    this.showPaidBadge = false,
    this.isEmptySlot = false,
  });

  final String displayName;
  final String subtitle;
  final String initials;
  final String? avatarUrl;
  final bool isOrganizer;
  final bool isConfirmed;
  final bool showPaidBadge;
  final bool isEmptySlot;
}

class BookingDetailsTeamState {
  const BookingDetailsTeamState({
    required this.members,
    required this.confirmedCount,
    required this.totalSlots,
  });

  final List<BookingDetailsTeamMember> members;
  final int confirmedCount;
  final int totalSlots;
}

final bookingDetailsTeamProvider = FutureProvider.autoDispose
    .family<BookingDetailsTeamState, String>((ref, bookingId) async {
  final id = bookingId.trim();
  if (id.isEmpty) {
    return const BookingDetailsTeamState(
      members: [],
      confirmedCount: 0,
      totalSlots: kBookingTeamSlots,
    );
  }

  final snap = await ref.watch(arenaBookingDocProvider(id).future);
  final data = snap?.data() ?? <String, dynamic>{};
  final user = ref.watch(authProvider).valueOrNull;
  final ownerId = (data['ownerAthleteId'] as String?)?.trim() ??
      (data['athleteId'] as String?)?.trim() ??
      user?.uid;

  final participantsRaw = (data['confirmedParticipants'] as num?)?.toInt() ??
      (data['participantsConfirmedCount'] as num?)?.toInt() ??
      1;
  final confirmedCount = participantsRaw.clamp(1, kBookingTeamSlots);

  final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim();
  final paidOnline = (data['amountPaidOnlineReais'] as num?)?.toDouble();
  final showPaid = bookingDetailsShowPaidBadge(
    paymentStatus: ps,
    paidOnline: paidOnline,
  );

  final members = <BookingDetailsTeamMember>[];

  var organizerName = user?.displayName?.trim() ?? '';
  String? organizerAvatar;
  if (user != null) {
    final profile = await ref.watch(athleteProfileProvider.future);
    if (profile != null) {
      final display = athleteDisplayName(profile, fallback: '');
      if (display.isNotEmpty) organizerName = display;
    }
    organizerAvatar = profile?.avatarUrl;
  }
  if (organizerName.isEmpty) organizerName = 'Você';

  members.add(
    BookingDetailsTeamMember(
      displayName: 'Você',
      subtitle: 'organizador',
      initials: _initialsFrom(organizerName),
      avatarUrl: organizerAvatar,
      isOrganizer: true,
      isConfirmed: true,
      showPaidBadge: showPaid,
    ),
  );

  final guests = <MyBookingConfirmedAthlete>[];
  final parsed = MyBookingItem.parseConfirmedAthletesFromBooking(data);
  final seen = <String>{if (ownerId != null) ownerId};
  for (final athlete in parsed) {
    final uid = athlete.userId?.trim();
    if (uid != null && uid.isNotEmpty) {
      if (uid == ownerId || seen.contains(uid)) continue;
      seen.add(uid);
    }
    var name = athlete.displayName?.trim() ?? '';
    String? avatar = athlete.avatarUrl;
    if (uid != null && uid.isNotEmpty) {
      final profile = await ref.watch(athleteProfileByIdProvider(uid).future);
      if (profile != null) {
        if (name.isEmpty) name = athleteDisplayName(profile, fallback: '');
        avatar ??= profile.avatarUrl;
      }
    }
    if (name.isEmpty) name = 'Jogador confirmado';
    guests.add(
      MyBookingConfirmedAthlete(
        userId: uid,
        displayName: name,
        avatarUrl: avatar,
      ),
    );
  }

  for (final guest in guests) {
    final name = guest.displayName?.trim() ?? 'Jogador confirmado';
    members.add(
      BookingDetailsTeamMember(
        displayName: name,
        subtitle: 'Confirmado',
        initials: _initialsFrom(name),
        avatarUrl: guest.avatarUrl,
        isConfirmed: true,
      ),
    );
  }

  final emptySlots = kBookingTeamSlots - members.length;
  for (var i = 0; i < emptySlots; i++) {
    members.add(
      const BookingDetailsTeamMember(
        displayName: 'Vaga aberta',
        subtitle: 'Convide alguém da sua rede',
        initials: '+',
        isEmptySlot: true,
        isConfirmed: false,
      ),
    );
  }

  return BookingDetailsTeamState(
    members: members,
    confirmedCount: confirmedCount,
    totalSlots: kBookingTeamSlots,
  );
});

String _initialsFrom(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first[0].toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
