import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_slot.dart';
import '../domain/slots_query.dart';
import '../domain/virtual_slot_generator.dart';

/// `arenaSlots` + documento da quadra → lista final (persistidos ∪ virtuais).
///
/// - **Query só `arenaId`**: não depende de índice composto `courtId` (comum quando “não aparece nada”).
/// - Filtro em memória por `courtId` + dia.
/// - **Slots virtuais**: se não houver documentos ou para completar horários, usa `availabilitySchedule`
///   / `slotDurationMinutes` da quadra; senão **08:00–22:00** de hora em hora.
class SlotsRepository {
  SlotsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  static const String collectionName = 'arenaSlots';

  /// Um listener em `arenaSlots` (por `arenaId`) + um em `arenas/.../courts` — evita N queries duplicadas na agenda.
  Stream<List<ArenaSlot>> watchArenaDaySlotsMerged({
    required String arenaId,
    required DateTime date,
  }) {
    final day = DateTime(date.year, date.month, date.day);
    final slotsStream = _firestore
        .collection(collectionName)
        .where('arenaId', isEqualTo: arenaId)
        .snapshots();
    final courtsStream = _firestore
        .collection('arenas')
        .doc(arenaId)
        .collection('courts')
        .snapshots();

    return _combineLatest2<QuerySnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>, List<ArenaSlot>>(
      slotsStream,
      courtsStream,
      (slotSnap, courtsSnap) {
        final docs = courtsSnap.docs;
        if (docs.isEmpty) {
          return <ArenaSlot>[];
        }
        final merged = <ArenaSlot>[];
        for (final courtDoc in docs) {
          final query = SlotsQuery(
            arenaId: arenaId,
            courtId: courtDoc.id,
            date: day,
            fallbackPriceReais: null,
          );
          final persisted = _extractPersisted(slotSnap, query, day);
          final virtual = VirtualSlotGenerator.build(
            query: query,
            courtData: courtDoc.data(),
            date: day,
          );
          merged.addAll(VirtualSlotGenerator.merge(persisted, virtual));
        }
        merged.sort((a, b) {
          final byTime = a.startTime.compareTo(b.startTime);
          if (byTime != 0) return byTime;
          return a.courtId.compareTo(b.courtId);
        });
        return merged;
      },
    );
  }

  Stream<List<ArenaSlot>> watchSlots(SlotsQuery query) {
    final day = DateTime(query.date.year, query.date.month, query.date.day);

    final slotsStream = _firestore
        .collection(collectionName)
        .where('arenaId', isEqualTo: query.arenaId)
        .snapshots();

    final courtStream = _firestore
        .collection('arenas')
        .doc(query.arenaId)
        .collection('courts')
        .doc(query.courtId)
        .snapshots();

    return _combineLatest2<QuerySnapshot<Map<String, dynamic>>,
        DocumentSnapshot<Map<String, dynamic>>, List<ArenaSlot>>(
      slotsStream,
      courtStream,
      (slotSnap, courtSnap) {
        final persisted = _extractPersisted(slotSnap, query, day);
        final courtData = courtSnap.exists ? courtSnap.data() : null;
        final virtual = VirtualSlotGenerator.build(
          query: query,
          courtData: courtData,
          date: day,
        );
        return VirtualSlotGenerator.merge(persisted, virtual);
      },
    );
  }

  List<ArenaSlot> _extractPersisted(
    QuerySnapshot<Map<String, dynamic>> snap,
    SlotsQuery query,
    DateTime day,
  ) {
    final list = <ArenaSlot>[];
    for (final doc in snap.docs) {
      try {
        final slot = ArenaSlot.fromFirestore(doc);
        if (!_sameCalendarDay(slot.date, day)) continue;
        if (!_courtMatches(slot.courtId, query.courtId)) continue;
        list.add(slot);
      } on FormatException {
        continue;
      }
    }
    list.sort((a, b) => a.startTime.compareTo(b.startTime));
    return list;
  }

  static bool _courtMatches(String docCourtId, String queryCourtId) {
    final d = docCourtId.trim().toLowerCase();
    final q = queryCourtId.trim().toLowerCase();
    if (d.isEmpty) return false;
    return d == q;
  }

  static bool _sameCalendarDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

/// Emite quando [a] e [b] já emitiram pelo menos uma vez cada.
Stream<R> _combineLatest2<A, B, R>(
  Stream<A> streamA,
  Stream<B> streamB,
  R Function(A, B) combine,
) {
  final controller = StreamController<R>.broadcast();
  A? lastA;
  B? lastB;

  void emit() {
    final x = lastA;
    final y = lastB;
    if (x != null && y != null) {
      controller.add(combine(x, y));
    }
  }

  late final StreamSubscription<A> subA;
  late final StreamSubscription<B> subB;

  subA = streamA.listen(
    (a) {
      lastA = a;
      emit();
    },
    onError: controller.addError,
  );
  subB = streamB.listen(
    (b) {
      lastB = b;
      emit();
    },
    onError: controller.addError,
  );

  controller.onCancel = () async {
    await subA.cancel();
    await subB.cancel();
  };

  return controller.stream;
}
