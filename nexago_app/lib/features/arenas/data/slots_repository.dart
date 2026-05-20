import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_promotion.dart';
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
    final arenaStream =
        _firestore.collection('arenas').doc(arenaId).snapshots();
    final promotionsStream = _firestore
        .collection('arenas')
        .doc(arenaId)
        .collection('promotions')
        .where('active', isEqualTo: true)
        .snapshots();

    return _combineLatest4<
        QuerySnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>,
        DocumentSnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>,
        List<ArenaSlot>>(
      slotsStream,
      courtsStream,
      arenaStream,
      promotionsStream,
      (slotSnap, courtsSnap, arenaSnap, promoSnap) {
        final docs = courtsSnap.docs;
        if (docs.isEmpty) {
          return <ArenaSlot>[];
        }
        final arenaFallback = readArenaFallbackPricePerHour(
          arenaSnap.exists ? arenaSnap.data() : null,
        );
        final promotions = _parsePromotions(promoSnap);
        final merged = <ArenaSlot>[];
        for (final courtDoc in docs) {
          final query = SlotsQuery(
            arenaId: arenaId,
            courtId: courtDoc.id,
            date: day,
            arenaFallbackPricePerHourReais: arenaFallback,
          );
          final persisted = _extractPersisted(slotSnap, query, day);
          final virtual = VirtualSlotGenerator.build(
            query: query,
            courtData: courtDoc.data(),
            date: day,
            promotions: promotions,
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
    final arenaStream =
        _firestore.collection('arenas').doc(query.arenaId).snapshots();
    final promotionsStream = _firestore
        .collection('arenas')
        .doc(query.arenaId)
        .collection('promotions')
        .where('active', isEqualTo: true)
        .snapshots();

    return _combineLatest4<
        QuerySnapshot<Map<String, dynamic>>,
        DocumentSnapshot<Map<String, dynamic>>,
        DocumentSnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>,
        List<ArenaSlot>>(
      slotsStream,
      courtStream,
      arenaStream,
      promotionsStream,
      (slotSnap, courtSnap, arenaSnap, promoSnap) {
        final arenaFallback = readArenaFallbackPricePerHour(
              arenaSnap.exists ? arenaSnap.data() : null,
            ) ??
            query.arenaFallbackPricePerHourReais;
        final effectiveQuery = SlotsQuery(
          arenaId: query.arenaId,
          courtId: query.courtId,
          date: query.date,
          arenaFallbackPricePerHourReais: arenaFallback,
        );
        final persisted = _extractPersisted(slotSnap, effectiveQuery, day);
        final courtData = courtSnap.exists ? courtSnap.data() : null;
        final promotions = _parsePromotions(promoSnap);
        final virtual = VirtualSlotGenerator.build(
          query: effectiveQuery,
          courtData: courtData,
          date: day,
          promotions: promotions,
        );
        return VirtualSlotGenerator.merge(persisted, virtual);
      },
    );
  }

  static List<ArenaPromotion> _parsePromotions(
    QuerySnapshot<Map<String, dynamic>> snap,
  ) {
    return snap.docs.map(ArenaPromotion.fromFirestore).toList();
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

Stream<R> _combineLatest4<A, B, C, D, R>(
  Stream<A> streamA,
  Stream<B> streamB,
  Stream<C> streamC,
  Stream<D> streamD,
  R Function(A, B, C, D) combine,
) {
  final controller = StreamController<R>.broadcast();
  A? lastA;
  B? lastB;
  C? lastC;
  D? lastD;

  void emit() {
    final x = lastA;
    final y = lastB;
    final z = lastC;
    final w = lastD;
    if (x != null && y != null && z != null && w != null) {
      controller.add(combine(x, y, z, w));
    }
  }

  late final StreamSubscription<A> subA;
  late final StreamSubscription<B> subB;
  late final StreamSubscription<C> subC;
  late final StreamSubscription<D> subD;

  subA = streamA.listen((a) {
    lastA = a;
    emit();
  }, onError: controller.addError);
  subB = streamB.listen((b) {
    lastB = b;
    emit();
  }, onError: controller.addError);
  subC = streamC.listen((c) {
    lastC = c;
    emit();
  }, onError: controller.addError);
  subD = streamD.listen((d) {
    lastD = d;
    emit();
  }, onError: controller.addError);

  controller.onCancel = () async {
    await subA.cancel();
    await subB.cancel();
    await subC.cancel();
    await subD.cancel();
  };

  return controller.stream;
}

Stream<R> _combineLatest3<A, B, C, R>(
  Stream<A> streamA,
  Stream<B> streamB,
  Stream<C> streamC,
  R Function(A, B, C) combine,
) {
  final controller = StreamController<R>.broadcast();
  A? lastA;
  B? lastB;
  C? lastC;

  void emit() {
    final x = lastA;
    final y = lastB;
    final z = lastC;
    if (x != null && y != null && z != null) {
      controller.add(combine(x, y, z));
    }
  }

  late final StreamSubscription<A> subA;
  late final StreamSubscription<B> subB;
  late final StreamSubscription<C> subC;

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
  subC = streamC.listen(
    (c) {
      lastC = c;
      emit();
    },
    onError: controller.addError,
  );

  controller.onCancel = () async {
    await subA.cancel();
    await subB.cancel();
    await subC.cancel();
  };

  return controller.stream;
}
