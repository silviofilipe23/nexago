import 'package:cloud_functions/cloud_functions.dart';

import '../domain/arena_occupancy_report.dart';

/// Chama `getArenaOccupancyReport` (`functions/src/arena-occupancy-report.ts`).
class ArenaOccupancyReportService {
  ArenaOccupancyReportService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<ArenaOccupancyReport> fetchReport({
    required String arenaId,
    required String dateFrom,
    required String dateTo,
  }) async {
    final result =
        await _functions.httpsCallable('getArenaOccupancyReport').call(
      <String, dynamic>{
        'arenaId': arenaId,
        'dateFrom': dateFrom,
        'dateTo': dateTo,
      },
    );
    final data = result.data;
    if (data is Map) {
      return ArenaOccupancyReport.fromMap(Map<String, dynamic>.from(data));
    }
    return ArenaOccupancyReport.empty;
  }
}
