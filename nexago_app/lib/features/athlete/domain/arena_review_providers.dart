import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../data/arena_review_service.dart';
import 'arena_review.dart';

String _readString(Map<String, dynamic> data, List<String> keys) {
  for (final key in keys) {
    final raw = data[key];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
  }
  return '';
}

bool _isPlaceholderLabel(String value, List<String> placeholders) {
  final v = value.trim().toLowerCase();
  if (v.isEmpty) return true;
  return placeholders.any((p) => p.toLowerCase() == v);
}

final arenaReviewServiceProvider = Provider<ArenaReviewService>((ref) {
  return ArenaReviewService(ref.watch(firestoreProvider));
});

final pendingReviewProvider =
    FutureProvider.autoDispose<PendingArenaReview?>((ref) async {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) return null;
  final bookings = await ref.watch(myBookingsStreamProvider.future);
  final completed = bookings.where((b) {
    final status = b.rawStatus.trim().toLowerCase();
    return status == 'completed' || status == 'finalizado';
  }).toList(growable: false);
  if (completed.isEmpty) return null;

  final bookingIds =
      completed.map((b) => b.id).where((id) => id.trim().isNotEmpty).toList();
  if (bookingIds.isEmpty) return null;

  final firestore = ref.watch(firestoreProvider);
  final reviewedBookingIds = <String>{};
  for (var i = 0; i < bookingIds.length; i += 10) {
    final chunk = bookingIds.sublist(
        i, i + 10 > bookingIds.length ? bookingIds.length : i + 10);
    final reviews = await firestore
        .collection('arena_reviews')
        .where('userId', isEqualTo: userId)
        .where('bookingId', whereIn: chunk)
        .get();
    for (final doc in reviews.docs) {
      final bid = (doc.data()['bookingId'] as String?)?.trim();
      if (bid != null && bid.isNotEmpty) reviewedBookingIds.add(bid);
    }
  }

  for (final booking in completed) {
    if (reviewedBookingIds.contains(booking.id)) continue;
    String arenaId = booking.arenaId?.trim() ?? '';
    if (arenaId.isEmpty) continue;

    var arenaName =
        booking.arenaName.trim().isEmpty ? 'Arena' : booking.arenaName.trim();
    var courtName = booking.courtName?.trim().isNotEmpty == true
        ? booking.courtName!.trim()
        : 'Quadra';
    var dateRaw = booking.dateRaw.trim();
    var startTime = booking.startTime.trim();
    var endTime = booking.endTime.trim();
    var courtId = '';

    // Enriquecimento a partir do documento base para evitar campos vazios
    // quando o item já vem parcialmente normalizado.
    final bookingDoc =
        await firestore.collection('arenaBookings').doc(booking.id).get();
    if (bookingDoc.exists) {
      final data = bookingDoc.data() ?? <String, dynamic>{};
      arenaId = _readString(data, ['arenaId', 'arena_id', 'idArena']);
      if (arenaId.isEmpty) {
        arenaId = booking.arenaId?.trim() ?? '';
      }
      arenaName = _readString(data, ['arenaName', 'arena', 'nomeArena']);
      if (arenaName.isEmpty) {
        arenaName = booking.arenaName.trim().isEmpty
            ? 'Arena'
            : booking.arenaName.trim();
      }
      courtName = _readString(data, ['courtName', 'court', 'nomeQuadra']);
      if (courtName.isEmpty) {
        courtName = booking.courtName?.trim().isNotEmpty == true
            ? booking.courtName!.trim()
            : 'Quadra';
      }
      courtId = _readString(data, ['courtId', 'court_id', 'idQuadra']);
      dateRaw = _readString(data, ['date', 'bookingDate', 'data']);
      if (dateRaw.isEmpty) dateRaw = booking.dateRaw.trim();
      startTime = _readString(data, ['startTime', 'start', 'horaInicio']);
      if (startTime.isEmpty) startTime = booking.startTime.trim();
      endTime = _readString(data, ['endTime', 'end', 'horaFim']);
      if (endTime.isEmpty) endTime = booking.endTime.trim();
    }

    if (arenaId.isEmpty) continue;

    // Fallback final: resolve nomes por referência quando booking não trouxe.
    if (_isPlaceholderLabel(arenaName, ['Arena'])) {
      final arenaDoc = await firestore.collection('arenas').doc(arenaId).get();
      if (arenaDoc.exists) {
        final arenaData = arenaDoc.data() ?? <String, dynamic>{};
        final resolvedArenaName =
            _readString(arenaData, ['name', 'arenaName', 'title', 'nome']);
        if (resolvedArenaName.isNotEmpty) arenaName = resolvedArenaName;
      }
    }

    if (_isPlaceholderLabel(courtName, ['Quadra']) && courtId.isNotEmpty) {
      final courtDoc = await firestore
          .collection('arenas')
          .doc(arenaId)
          .collection('courts')
          .doc(courtId)
          .get();
      if (courtDoc.exists) {
        final courtData = courtDoc.data() ?? <String, dynamic>{};
        final resolvedCourtName =
            _readString(courtData, ['name', 'courtName', 'title', 'nome']);
        if (resolvedCourtName.isNotEmpty) courtName = resolvedCourtName;
      }
    }

    return PendingArenaReview(
      bookingId: booking.id,
      arenaId: arenaId,
      arenaName: arenaName,
      courtName: courtName,
      dateRaw: dateRaw,
      startTime: startTime,
      endTime: endTime,
    );
  }
  return null;
});

final arenaReviewsStreamProvider = StreamProvider.autoDispose
    .family<List<ArenaReview>, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(const []);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arena_reviews')
      .where('arenaId', isEqualTo: aid)
      .snapshots()
      .asyncMap((snap) async {
    final items = snap.docs.map(ArenaReview.fromFirestore).toList();
    items.sort((a, b) {
      final aMs = a.createdAt?.millisecondsSinceEpoch ?? 0;
      final bMs = b.createdAt?.millisecondsSinceEpoch ?? 0;
      return bMs.compareTo(aMs);
    });
    final capped =
        items.length > 50 ? items.sublist(0, 50) : List<ArenaReview>.from(items);

    final userIds = capped
        .map((e) => e.userId.trim())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList(growable: false);
    final userNames = <String, String>{};
    for (var i = 0; i < userIds.length; i += 10) {
      final chunk =
          userIds.sublist(i, i + 10 > userIds.length ? userIds.length : i + 10);
      final usersSnap = await firestore
          .collection('users')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();
      for (final doc in usersSnap.docs) {
        final name = (doc.data()['name'] as String?)?.trim();
        if (name != null && name.isNotEmpty) userNames[doc.id] = name;
      }
    }

    return List.unmodifiable(
      capped.map((r) => r.copyWith(athleteName: userNames[r.userId])),
    );
  });
});

final recentArenaReviewerProvider =
    StreamProvider.autoDispose.family<String?, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(null);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arena_reviews')
      .where('arenaId', isEqualTo: aid)
      .snapshots()
      .asyncMap((snap) async {
    if (snap.docs.isEmpty) return null;
    final docs = [...snap.docs]
      ..sort((a, b) {
        final aTs = a.data()['createdAt'];
        final bTs = b.data()['createdAt'];
        final aMs = aTs is Timestamp ? aTs.millisecondsSinceEpoch : 0;
        final bMs = bTs is Timestamp ? bTs.millisecondsSinceEpoch : 0;
        return bMs.compareTo(aMs);
      });
    final data = docs.first.data();
    final userId = (data['userId'] as String?)?.trim() ?? '';
    if (userId.isEmpty) return null;
    final userDoc = await firestore.collection('users').doc(userId).get();
    final name = (userDoc.data()?['name'] as String?)?.trim();
    if (name == null || name.isEmpty) return null;
    return 'Avaliado recentemente por $name';
  });
});
