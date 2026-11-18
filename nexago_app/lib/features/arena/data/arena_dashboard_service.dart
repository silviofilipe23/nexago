import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/arena_slot.dart';
import '../domain/arena_dashboard_period.dart';
import '../domain/arena_dashboard_period_metrics.dart';
import '../domain/arena_dashboard_summary.dart';
import '../domain/arena_date_utils.dart';
import '../domain/arena_manager_booking.dart';

/// KPIs do painel a partir de dados já carregados pelos listeners do Firestore.
///
/// **Coleções neste projeto (equivalente a bookings / slots / courts):**
/// - [arenaBookingsCollection] — reservas
/// - [arenaSlotsCollection] — horários
/// - `arenas/{arenaId}/courts` — quadras
class ArenaDashboardService {
  const ArenaDashboardService();

  /// Paridade com [BookingService.arenaBookingsCollection].
  static const String arenaBookingsCollection = 'arenaBookings';

  /// Paridade com [SlotsRepository.collectionName].
  static const String arenaSlotsCollection = 'arenaSlots';

  static const Map<int, String> _weekdayPt = {
    DateTime.monday: 'Segunda-feira',
    DateTime.tuesday: 'Terça-feira',
    DateTime.wednesday: 'Quarta-feira',
    DateTime.thursday: 'Quinta-feira',
    DateTime.friday: 'Sexta-feira',
    DateTime.saturday: 'Sábado',
    DateTime.sunday: 'Domingo',
  };

  /// Três consultas em paralelo (mesmas coleções do painel). Útil para refresh pontual.
  static Future<({
    QuerySnapshot<Map<String, dynamic>> bookings,
    QuerySnapshot<Map<String, dynamic>> slots,
    QuerySnapshot<Map<String, dynamic>> courts,
  })> fetchDashboardSnapshotsParallel({
    required FirebaseFirestore firestore,
    required String arenaId,
  }) async {
    final id = arenaId.trim();
    if (id.isEmpty) {
      throw ArgumentError.value(arenaId, 'arenaId');
    }
    final list = await Future.wait([
      firestore
          .collection(arenaBookingsCollection)
          .where('arenaId', isEqualTo: id)
          .limit(256)
          .get(),
      firestore
          .collection(arenaSlotsCollection)
          .where('arenaId', isEqualTo: id)
          .get(),
      firestore.collection('arenas').doc(id).collection('courts').get(),
    ]);
    return (
      bookings: list[0],
      slots: list[1],
      courts: list[2],
    );
  }

  /// Calcula todos os KPIs em memória (sem queries adicionais).
  ArenaDashboardSummary summarize({
    required List<ArenaManagerBooking> bookings,
    required List<ArenaSlot> slots,
    required List<ArenaCourt> courts,
    required DateTime todayReference,
  }) {
    final anchor = arenaDateOnly(todayReference);
    final todayKey = arenaDateKey(anchor);

    final keys7 = List.generate(7, (i) {
      final d = anchor.subtract(Duration(days: 6 - i));
      return arenaDateKey(d);
    });

    final chartDayLabels = List.generate(7, (i) {
      final d = anchor.subtract(Duration(days: 6 - i));
      return DateFormat.E('pt_BR').format(d);
    });

    final revenueByDay = <String, double>{
      for (final k in keys7) k: 0,
    };

    final weekdayRevenue = <int, double>{};

    for (final b in bookings) {
      if (_bookingStatusIsCanceled(b.data)) continue;
      if (!_countsTowardRevenue(b)) continue;
      final amount = _bookingAmountReais(b.data);
      final k = b.dateKey;
      if (revenueByDay.containsKey(k)) {
        revenueByDay[k] = (revenueByDay[k] ?? 0) + amount;
      }
      final day = _dateKeyToLocalDay(k);
      if (day != null) {
        final w = day.weekday;
        weekdayRevenue[w] = (weekdayRevenue[w] ?? 0) + amount;
      }
    }

    final revenueLast7Days = keys7.map((k) => revenueByDay[k] ?? 0).toList();

    String? bestWeekdayLabel;
    double bestWeekdayRevenue = 0;
    if (weekdayRevenue.isNotEmpty) {
      final best = weekdayRevenue.entries.reduce((a, b) {
        if (b.value > a.value) return b;
        return a;
      });
      bestWeekdayRevenue = best.value;
      bestWeekdayLabel = _weekdayPt[best.key];
    }

    final todayBookings = bookings
        .where(
          (b) => b.dateKey == todayKey && !_bookingStatusIsCanceled(b.data),
        )
        .toList();

    final bookingsToday = todayBookings.length;

    final revenueToday = todayBookings
        .where(_countsTowardRevenue)
        .fold<double>(0, (acc, b) => acc + _bookingAmountReais(b.data));

    final hourCounts = <int, int>{};
    for (final b in todayBookings) {
      final h = _startHour(b.startTime);
      if (h != null) {
        hourCounts[h] = (hourCounts[h] ?? 0) + 1;
      }
    }
    int? peakHour;
    if (hourCounts.isNotEmpty) {
      peakHour = hourCounts.entries.reduce((best, e) {
        if (e.value > best.value) return e;
        if (e.value == best.value && e.key < best.key) return e;
        return best;
      }).key;
    }

    final futureBookings = bookings
        .where(
          (b) =>
              b.dateKey.compareTo(todayKey) > 0 &&
              !_bookingStatusIsCanceled(b.data),
        )
        .length;

    final todaySlotsTotal = slots.length;
    final bookedSlots = slots.where((s) => s.isBooked).length;
    final occupancyRatePercent =
        todaySlotsTotal == 0 ? 0.0 : (bookedSlots / todaySlotsTotal) * 100;

    final availableSlots = slots.where((s) => s.isAvailable).length;

    return ArenaDashboardSummary(
      bookingsToday: bookingsToday,
      availableSlots: availableSlots,
      activeCourts: courts.length,
      revenueToday: revenueToday,
      occupancyRatePercent: occupancyRatePercent,
      peakHour: peakHour,
      futureBookings: futureBookings,
      revenueLast7Days: revenueLast7Days,
      chartDayLabels: chartDayLabels,
      todaySlotsTotal: todaySlotsTotal,
      bestWeekdayLabel: bestWeekdayLabel,
      bestWeekdayRevenue: bestWeekdayRevenue,
    );
  }

  /// KPIs e badges para [period], derivados do resumo base e das reservas.
  ArenaDashboardPeriodMetrics periodMetrics({
    required ArenaDashboardSummary summary,
    required List<ArenaManagerBooking> bookings,
    required ArenaDashboardPeriod period,
    required DateTime todayReference,
  }) {
    final anchor = arenaDateOnly(todayReference);
    final periodDays = period.days;

    final periodKeys = List.generate(periodDays, (i) {
      final d = anchor.subtract(Duration(days: periodDays - 1 - i));
      return arenaDateKey(d);
    });
    final periodKeySet = periodKeys.toSet();

    final periodBookings = bookings.where((b) {
      if (_bookingStatusIsCanceled(b.data)) return false;
      return periodKeySet.contains(b.dateKey);
    }).toList();

    final revenue = periodBookings
        .where(_countsTowardRevenue)
        .fold<double>(0, (acc, b) => acc + _bookingAmountReais(b.data));

    final bookingsCount = periodBookings.length;

    final slotsCapacity = summary.todaySlotsTotal * periodDays;
    final occupancyRatePercent = slotsCapacity == 0
        ? 0.0
        : (bookingsCount / slotsCapacity * 100).clamp(0.0, 100.0);

    final hourCounts = <int, int>{};
    for (final b in periodBookings) {
      final h = _startHour(b.startTime);
      if (h != null) hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    }
    int? peakHour;
    if (hourCounts.isNotEmpty) {
      peakHour = hourCounts.entries.reduce((best, e) {
        if (e.value > best.value) return e;
        if (e.value == best.value && e.key < best.key) return e;
        return best;
      }).key;
    }

    final chartTotal7Days =
        summary.revenueLast7Days.fold<double>(0, (a, b) => a + b);

    // Comparações justas: mesmo dia da semana / mesma duração de janela.
    // Comparar hoje com a média dos 6 dias anteriores misturava domingo com
    // terça e acendia vermelho falso; o mês fica sem variação porque a janela
    // de reservas só olha 30 dias para trás.
    final last7 = _revenueBetween(bookings, anchor, 0, 7);
    final prev7 = _revenueBetween(bookings, anchor, 7, 14);
    final chartTrendPercent = _changePercent(last7, prev7);

    final (double? revenueTrendPercent, String? comparisonLabel) =
        switch (period) {
      ArenaDashboardPeriod.today => (
          _changePercent(
            _revenueBetween(bookings, anchor, 0, 1),
            _revenueBetween(bookings, anchor, 7, 8),
          ),
          'vs. o mesmo dia da semana passada',
        ),
      ArenaDashboardPeriod.week => (
          chartTrendPercent,
          'vs. os 7 dias anteriores',
        ),
      ArenaDashboardPeriod.month => (null, null),
    };

    ArenaDashboardKpiBadge? revenueBadge;
    if (revenueTrendPercent != null && revenueTrendPercent.abs() >= 1) {
      final positive = revenueTrendPercent > 0;
      revenueBadge = ArenaDashboardKpiBadge(
        label:
            '${positive ? '▲' : '▼'} ${revenueTrendPercent.abs().toStringAsFixed(0)}%',
        tone: positive
            ? ArenaDashboardKpiBadgeTone.positive
            : ArenaDashboardKpiBadgeTone.negative,
      );
    }

    ArenaDashboardKpiBadge? occupancyBadge;
    final occ = period == ArenaDashboardPeriod.today
        ? summary.occupancyRatePercent
        : occupancyRatePercent;
    if (occ < 40) {
      // Nível, não variação: sem seta de queda.
      occupancyBadge = const ArenaDashboardKpiBadge(
        label: 'baixa',
        tone: ArenaDashboardKpiBadgeTone.negative,
      );
    }

    final peak = period == ArenaDashboardPeriod.today
        ? summary.peakHour
        : peakHour;

    return ArenaDashboardPeriodMetrics(
      period: period,
      revenue: period == ArenaDashboardPeriod.today ? summary.revenueToday : revenue,
      bookingsCount: period == ArenaDashboardPeriod.today
          ? summary.bookingsToday
          : bookingsCount,
      occupancyRatePercent: occ,
      peakHour: peak,
      revenueBadge: revenueBadge,
      occupancyBadge: occupancyBadge,
      bookingsBadge: null,
      peakBadge: null,
      chartTotal7Days: chartTotal7Days,
      chartTrendPercent: chartTrendPercent,
      comparisonLabel: revenueBadge == null ? null : comparisonLabel,
    );
  }

  /// Receita das reservas ativas entre `fromDaysAgo` (inclusive) e
  /// `toDaysAgo` (exclusive) dias antes de [anchor]; 0 = hoje.
  static double _revenueBetween(
    List<ArenaManagerBooking> bookings,
    DateTime anchor,
    int fromDaysAgo,
    int toDaysAgo,
  ) {
    final keys = {
      for (var i = fromDaysAgo; i < toDaysAgo; i++)
        arenaDateKey(anchor.subtract(Duration(days: i))),
    };
    return bookings
        .where((b) =>
            keys.contains(b.dateKey) &&
            !_bookingStatusIsCanceled(b.data) &&
            _countsTowardRevenue(b))
        .fold<double>(0, (acc, b) => acc + _bookingAmountReais(b.data));
  }

  static double? _changePercent(double current, double base) {
    if (base <= 0) return null;
    return (current - base) / base * 100;
  }

  static DateTime? _dateKeyToLocalDay(String key) {
    if (key.length < 10) return null;
    final p = DateTime.tryParse(key.substring(0, 10));
    if (p == null) return null;
    return DateTime(p.year, p.month, p.day);
  }

  static bool _bookingStatusIsCanceled(Map<String, dynamic> data) {
    final s = (data['status'] as String?)?.trim().toLowerCase();
    return s == 'canceled' || s == 'cancelled';
  }

  static bool _countsTowardRevenue(ArenaManagerBooking b) {
    final d = b.data;
    final ps = (d['paymentStatus'] as String?)?.trim().toLowerCase();
    if (ps == 'rejected' || ps == 'cancelled' || ps == 'canceled') {
      return false;
    }
    return true;
  }

  static double _bookingAmountReais(Map<String, dynamic> d) {
    final v = d['amountReais'] ?? d['priceReais'] ?? d['price'];
    if (v is num) return v.toDouble();
    return 0;
  }

  static int? _startHour(String startTime) {
    final t = startTime.trim();
    if (t.length < 2) return null;
    final parts = t.split(':');
    return int.tryParse(parts[0]);
  }
}
