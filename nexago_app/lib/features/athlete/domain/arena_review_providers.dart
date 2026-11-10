import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_date_format.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../data/arena_review_service.dart';
import 'arena_reputation.dart';
import 'arena_review.dart';
import 'arena_review_eligibility.dart';

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

/// Reservas cujo convite o atleta dispensou ("Agora não") nesta sessão — não persiste:
/// reabrir o app traz o cartão de volta, como no portal.
final dismissedArenaReviewsProvider = StateProvider<Set<String>>((ref) => const {});

/// Reservas avaliadas nesta sessão: o cartão e o botão somem na hora, sem esperar a
/// consulta ao servidor.
final locallyReviewedBookingsProvider =
    StateProvider<Set<String>>((ref) => const {});

/// Ids das reservas, entre [bookingIds], que o atleta já avaliou (lotes de 10 do `in`).
Future<Set<String>> _reviewedBookingIds(
  FirebaseFirestore firestore,
  String userId,
  List<String> bookingIds,
) async {
  final reviewed = <String>{};
  for (var i = 0; i < bookingIds.length; i += 10) {
    final chunk = bookingIds.sublist(
      i,
      i + 10 > bookingIds.length ? bookingIds.length : i + 10,
    );
    final reviews = await firestore
        .collection('arena_reviews')
        .where('userId', isEqualTo: userId)
        .where('bookingId', whereIn: chunk)
        .get();
    for (final doc in reviews.docs) {
      final bid = (doc.data()['bookingId'] as String?)?.trim();
      if (bid != null && bid.isNotEmpty) reviewed.add(bid);
    }
  }
  return reviewed;
}

/// Convite "Como foi o jogo?" de Minhas reservas: a reserva concluída mais recente
/// (até 30 dias), ainda sem avaliação e não dispensada.
final pendingReviewProvider =
    FutureProvider.autoDispose<PendingArenaReview?>((ref) async {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) return null;
  final bookings = await ref.watch(myBookingsStreamProvider.future);
  final dismissed = ref.watch(dismissedArenaReviewsProvider);
  final local = ref.watch(locallyReviewedBookingsProvider);
  final now = DateTime.now();
  final windowStart = now.subtract(arenaReviewPromptWindow);

  final candidates = bookings.where((b) {
    if (!canOfferArenaReview(b, now)) return false;
    final endsAt = arenaReviewEndsAt(
      dateRaw: b.dateRaw,
      startTime: b.startTime,
      endTime: b.endTime,
    );
    return endsAt != null && !endsAt.isBefore(windowStart);
  }).toList(growable: false);
  if (candidates.isEmpty) return null;

  final firestore = ref.watch(firestoreProvider);
  final reviewed = await _reviewedBookingIds(
    firestore,
    userId,
    candidates.map((b) => b.id).toList(growable: false),
  );
  final picked = pickPendingArenaReview(
    candidates,
    excludedBookingIds: {...reviewed, ...dismissed, ...local},
    now: now,
  );
  if (picked == null) return null;
  return _loadReviewTarget(firestore, picked.id, fallback: picked);
});

/// Alvo da tela "Avaliar reserva" (`/booking/:bookingId/review`), aberta pelo cartão,
/// pelo detalhe da reserva ou pelo push `arena_review_request`. Null quando a reserva
/// não existe ou não tem arena.
final arenaReviewTargetProvider = FutureProvider.autoDispose
    .family<PendingArenaReview?, String>((ref, bookingId) async {
  final bid = bookingId.trim();
  if (bid.isEmpty) return null;
  return _loadReviewTarget(ref.watch(firestoreProvider), bid);
});

/// Situação da reserva para o botão de avaliar (detalhe e tela de avaliar).
enum ArenaBookingReviewStatus { reviewed, notReviewed }

final arenaBookingReviewStatusProvider = FutureProvider.autoDispose
    .family<ArenaBookingReviewStatus, String>((ref, bookingId) async {
  final bid = bookingId.trim();
  if (ref.watch(locallyReviewedBookingsProvider).contains(bid)) {
    return ArenaBookingReviewStatus.reviewed;
  }
  final userId = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (bid.isEmpty || userId.isEmpty) return ArenaBookingReviewStatus.notReviewed;
  final reviewed = await _reviewedBookingIds(
    ref.watch(firestoreProvider),
    userId,
    [bid],
  );
  return reviewed.contains(bid)
      ? ArenaBookingReviewStatus.reviewed
      : ArenaBookingReviewStatus.notReviewed;
});

/// Lê a reserva e resolve nomes de arena e quadra que vierem vazios.
Future<PendingArenaReview?> _loadReviewTarget(
  FirebaseFirestore firestore,
  String bookingId, {
  MyBookingItem? fallback,
}) async {
  final bookingDoc =
      await firestore.collection('arenaBookings').doc(bookingId).get();
  final data = bookingDoc.data() ?? <String, dynamic>{};
  if (!bookingDoc.exists && fallback == null) return null;

  String pick(List<String> keys, String fallbackValue) {
    final value = _readString(data, keys);
    return value.isNotEmpty ? value : fallbackValue.trim();
  }

  final arenaId = pick(['arenaId', 'arena_id', 'idArena'], fallback?.arenaId ?? '');
  if (arenaId.isEmpty) return null;
  var arenaName = pick(['arenaName', 'arena', 'nomeArena'], fallback?.arenaName ?? '');
  var courtName = pick(['courtName', 'court', 'nomeQuadra'], fallback?.courtName ?? '');
  final courtId = _readString(data, ['courtId', 'court_id', 'idQuadra']);
  final rawDate = data['date'];
  final dateRaw = rawDate is Timestamp
      ? calendarDateKey(rawDate.toDate())
      : pick(['date', 'bookingDate', 'data'], fallback?.dateRaw ?? '');
  final startTime = pick(['startTime', 'start', 'horaInicio'], fallback?.startTime ?? '');
  final endTime = pick(['endTime', 'end', 'horaFim'], fallback?.endTime ?? '');
  final status = pick(['status'], fallback?.rawStatus ?? '');

  if (_isPlaceholderLabel(arenaName, ['Arena'])) {
    final arenaDoc = await firestore.collection('arenas').doc(arenaId).get();
    final resolved =
        _readString(arenaDoc.data() ?? {}, ['name', 'arenaName', 'title', 'nome']);
    arenaName = resolved.isNotEmpty ? resolved : 'Arena';
  }
  if (_isPlaceholderLabel(courtName, ['Quadra']) && courtId.isNotEmpty) {
    final courtDoc = await firestore
        .collection('arenas')
        .doc(arenaId)
        .collection('courts')
        .doc(courtId)
        .get();
    final resolved =
        _readString(courtDoc.data() ?? {}, ['name', 'courtName', 'title', 'nome']);
    if (resolved.isNotEmpty) courtName = resolved;
  }

  return PendingArenaReview(
    bookingId: bookingId,
    arenaId: arenaId,
    arenaName: arenaName,
    courtName: courtName,
    dateRaw: dateRaw,
    startTime: startTime,
    endTime: endTime,
    ownerUid: _readString(data, ['athleteId', 'bookingAthleteId']),
    rawStatus: status,
  );
}

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
    final capped = items.length > 50
        ? items.sublist(0, 50)
        : List<ArenaReview>.from(items);

    final userIds = capped
        .map((e) => e.userId.trim())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList(growable: false);
    final userNames = <String, String>{};
    final userAvatars = <String, String>{};
    for (var i = 0; i < userIds.length; i += 10) {
      final chunk =
          userIds.sublist(i, i + 10 > userIds.length ? userIds.length : i + 10);
      final usersSnap = await firestore
          .collection('public_profiles')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();
      for (final doc in usersSnap.docs) {
        final data = doc.data();
        final name = (data['name'] as String?)?.trim();
        if (name != null && name.isNotEmpty) userNames[doc.id] = name;
        final avatar = ArenaReview.avatarUrlFromUserData(data);
        if (avatar != null) userAvatars[doc.id] = avatar;
      }
    }

    return List.unmodifiable(
      capped.map(
        (r) => r.copyWith(
          athleteName: userNames[r.userId],
          athleteAvatarUrl: userAvatars[r.userId],
        ),
      ),
    );
  });
});

final arenaReviewsProvider = StreamProvider.autoDispose
    .family<List<ArenaReview>, String>((ref, arenaId) {
  return ref.watch(arenaReviewsStreamProvider(arenaId).stream);
});

final arenaReputationProvider =
    StreamProvider.autoDispose.family<ArenaReputation?, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(null);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arena_reputation')
      .doc(aid)
      .snapshots()
      .map((doc) => doc.exists ? ArenaReputation.fromFirestore(doc) : null);
});

final reviewLikesProvider =
    StreamProvider.autoDispose.family<int, String>((ref, reviewId) {
  final rid = reviewId.trim();
  if (rid.isEmpty) return Stream.value(0);
  return ref
      .watch(firestoreProvider)
      .collection('arena_reviews')
      .doc(rid)
      .snapshots()
      .map((doc) => (doc.data()?['likesCount'] as num?)?.toInt() ?? 0);
});

final reviewLikedByMeProvider =
    StreamProvider.autoDispose.family<bool, String>((ref, reviewId) {
  final rid = reviewId.trim();
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  if (rid.isEmpty || uid.isEmpty) return Stream.value(false);
  return ref
      .watch(firestoreProvider)
      .collection('arena_reviews')
      .doc(rid)
      .collection('likes')
      .doc(uid)
      .snapshots()
      .map((doc) => doc.exists);
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
    final docs = [...snap.docs]..sort((a, b) {
        final aTs = a.data()['createdAt'];
        final bTs = b.data()['createdAt'];
        final aMs = aTs is Timestamp ? aTs.millisecondsSinceEpoch : 0;
        final bMs = bTs is Timestamp ? bTs.millisecondsSinceEpoch : 0;
        return bMs.compareTo(aMs);
      });
    final data = docs.first.data();
    final userId = (data['userId'] as String?)?.trim() ?? '';
    if (userId.isEmpty) return null;
    final userDoc =
        await firestore.collection('public_profiles').doc(userId).get();
    final name = (userDoc.data()?['name'] as String?)?.trim();
    if (name == null || name.isEmpty) return null;
    return 'Avaliado recentemente por $name';
  });
});
