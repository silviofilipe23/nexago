import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'gamification_providers.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/arenas_providers.dart';

class BookingAttendanceState {
  const BookingAttendanceState({
    required this.bookingId,
    required this.attendanceStatus,
    required this.attendanceConfirmed,
    required this.windowOpen,
    required this.confirmedPlayers,
    required this.checkInAllowed,
    this.attendanceConfirmedAt,
    this.confirmationDeadline,
    this.checkedInAt,
    this.locationVerified = false,
  });

  final String bookingId;
  final String attendanceStatus;
  final bool attendanceConfirmed;
  final bool windowOpen;
  final int confirmedPlayers;
  final bool checkInAllowed;
  final DateTime? attendanceConfirmedAt;
  final DateTime? confirmationDeadline;
  final DateTime? checkedInAt;
  final bool locationVerified;
}

final bookingAttendanceProvider =
    StreamProvider.autoDispose.family<BookingAttendanceState?, String>(
  (ref, bookingId) {
    final id = bookingId.trim();
    if (id.isEmpty) return Stream.value(null);
    final firestore = ref.watch(firestoreProvider);
    return firestore.collection('arenaBookings').doc(id).snapshots().map((doc) {
      if (!doc.exists) return null;
      final data = doc.data() ?? <String, dynamic>{};
      final rawStatus =
          ((data['attendanceStatus'] as String?)?.trim().toLowerCase() ?? 'pending');
      final confirmed = data['attendanceConfirmed'] == true;
      final deadline = (data['confirmationDeadline'] as Timestamp?)?.toDate();
      final now = DateTime.now();
      final isWindowOpen = deadline != null ? !now.isBefore(deadline) : false;

      final participants = (data['confirmedParticipants'] as num?)?.toInt() ??
          (data['participantsConfirmedCount'] as num?)?.toInt() ??
          (confirmed ? 1 : 0);
      final startRaw = (data['startTime'] as String?)?.trim() ?? '';
      final endRaw = (data['endTime'] as String?)?.trim() ?? '';
      final dateRaw = data['date'];
      DateTime? startAt;
      DateTime? endAt;
      if (dateRaw is String && dateRaw.length >= 10) {
        final d = DateTime.tryParse(dateRaw.substring(0, 10));
        if (d != null) {
          final s = startRaw.split(':');
          final e = endRaw.split(':');
          final sh = int.tryParse(s[0]) ?? 0;
          final sm = s.length > 1 ? (int.tryParse(s[1]) ?? 0) : 0;
          final eh = int.tryParse(e[0]) ?? 0;
          final em = e.length > 1 ? (int.tryParse(e[1]) ?? 0) : 0;
          startAt = DateTime(d.year, d.month, d.day, sh, sm);
          endAt = DateTime(d.year, d.month, d.day, eh, em);
        }
      } else if (dateRaw is Timestamp) {
        final d = dateRaw.toDate();
        final s = startRaw.split(':');
        final e = endRaw.split(':');
        final sh = int.tryParse(s[0]) ?? 0;
        final sm = s.length > 1 ? (int.tryParse(s[1]) ?? 0) : 0;
        final eh = int.tryParse(e[0]) ?? 0;
        final em = e.length > 1 ? (int.tryParse(e[1]) ?? 0) : 0;
        startAt = DateTime(d.year, d.month, d.day, sh, sm);
        endAt = DateTime(d.year, d.month, d.day, eh, em);
      }
      if (startAt != null && endAt != null && !endAt.isAfter(startAt)) {
        endAt = endAt.add(const Duration(days: 1));
      }
      final checkedInAt = (data['checkedInAt'] as Timestamp?)?.toDate();
      final checkInAllowed = startAt != null &&
          endAt != null &&
          rawStatus != 'checked_in' &&
          rawStatus != 'no_show' &&
          !now.isBefore(startAt.subtract(const Duration(minutes: 20))) &&
          !now.isAfter(endAt.add(const Duration(minutes: 15)));

      return BookingAttendanceState(
        bookingId: doc.id,
        attendanceStatus: rawStatus,
        attendanceConfirmed: confirmed,
        windowOpen: isWindowOpen,
        confirmedPlayers: participants,
        checkInAllowed: checkInAllowed,
        attendanceConfirmedAt: (data['attendanceConfirmedAt'] as Timestamp?)?.toDate(),
        confirmationDeadline: deadline,
        checkedInAt: checkedInAt,
        locationVerified: data['locationVerified'] == true,
      );
    });
  },
);

class ConfirmAttendanceController {
  ConfirmAttendanceController(this.ref);

  final Ref ref;

  Future<void> confirm(String bookingId) async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.trim().isEmpty) {
      throw Exception('Faça login para confirmar presença.');
    }
    await ref
        .read(bookingServiceProvider)
        .confirmAttendance(bookingId: bookingId, athleteId: uid);
    try {
      await ref.read(gamificationServiceProvider).addXp(
            userId: uid,
            amount: 5,
            reason: 'attendance_confirmed',
          );
    } catch (_) {
      // Nao bloqueia o fluxo principal quando gamificacao falhar.
    }
  }
}

final confirmAttendanceProvider = Provider<ConfirmAttendanceController>(
  (ref) => ConfirmAttendanceController(ref),
);

class CheckInController {
  CheckInController(this.ref);

  final Ref ref;

  Future<void> checkIn({
    required String bookingId,
    bool locationVerified = false,
  }) async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.trim().isEmpty) {
      throw Exception('Faça login para fazer check-in.');
    }
    await ref.read(bookingServiceProvider).checkIn(
          bookingId: bookingId,
          athleteId: uid,
          locationVerified: locationVerified,
        );
  }
}

final checkInProvider = Provider<CheckInController>(
  (ref) => CheckInController(ref),
);
