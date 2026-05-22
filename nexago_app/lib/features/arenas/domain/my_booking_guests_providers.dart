import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import 'arenas_providers.dart';
import 'my_booking_confirmed_athlete.dart';
import 'my_booking_item.dart';

/// Atleta confirmado pronto para exibir no card (nome curto + avatar).
class MyBookingGuestDisplay {
  const MyBookingGuestDisplay({
    required this.displayName,
    required this.shortLabel,
    this.userId,
    this.avatarUrl,
  });

  final String displayName;
  final String shortLabel;
  final String? userId;
  final String? avatarUrl;
}

final myBookingGuestDisplaysProvider = FutureProvider.autoDispose
    .family<List<MyBookingGuestDisplay>, MyBookingItem>((ref, item) async {
  final currentUid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  final ownerId = item.ownerAthleteId?.trim();
  final guests = <MyBookingGuestDisplay>[];
  final seen = <String>{};

  Future<void> addAthlete(MyBookingConfirmedAthlete athlete) async {
    final uid = athlete.userId?.trim();
    if (uid != null &&
        uid.isNotEmpty &&
        (uid == currentUid || uid == ownerId)) {
      return;
    }

    var name = athlete.displayName?.trim() ?? '';
    String? avatar = athlete.avatarUrl;
    if (uid != null && uid.isNotEmpty) {
      final profile = await ref.watch(athleteProfileByIdProvider(uid).future);
      if (profile != null) {
        if (name.isEmpty) name = profile.name.trim();
        avatar ??= profile.avatarUrl;
      }
      if (seen.contains(uid)) return;
      seen.add(uid);
    } else {
      final key = 'name:$name';
      if (name.isEmpty || seen.contains(key)) return;
      seen.add(key);
    }

    if (name.isEmpty) name = 'Jogador confirmado';
    guests.add(
      MyBookingGuestDisplay(
        userId: uid,
        displayName: name,
        shortLabel: shortAthleteName(name),
        avatarUrl: avatar,
      ),
    );
  }

  for (final athlete in item.confirmedAthletes) {
    await addAthlete(athlete);
  }

  if (guests.isEmpty && item.confirmedParticipants > 1) {
    final firestore = ref.watch(firestoreProvider);
    final invites = await firestore
        .collection('bookingInvites')
        .where('bookingId', isEqualTo: item.id)
        .where('status', isEqualTo: 'accepted')
        .limit(5)
        .get();

    for (final doc in invites.docs) {
      final data = doc.data();
      final acceptedBy = (data['acceptedByUid'] as String?)?.trim();
      if (acceptedBy != null && acceptedBy.isNotEmpty) {
        await addAthlete(MyBookingConfirmedAthlete(userId: acceptedBy));
      }
    }
  }

  if (guests.isEmpty &&
      item.confirmedParticipants > 1 &&
      item.attendanceConfirmed) {
    guests.add(
      const MyBookingGuestDisplay(
        displayName: 'Jogador confirmado',
        shortLabel: 'Jogador confirmado',
      ),
    );
  }

  return guests;
});

String shortAthleteName(String fullName) {
  final parts =
      fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return fullName.trim();
  if (parts.length == 1) return parts.first;
  final first = parts.first;
  final lastInitial =
      parts.last.isNotEmpty ? parts.last[0].toUpperCase() : '';
  return '$first $lastInitial.';
}
