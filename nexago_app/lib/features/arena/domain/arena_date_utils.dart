import 'package:cloud_firestore/cloud_firestore.dart';

DateTime arenaDateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

DateTime arenaTodayDateOnly() => arenaDateOnly(DateTime.now());

String arenaDateKey(DateTime d) {
  final x = arenaDateOnly(d);
  return '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
}

String arenaDateKeyFromDynamic(dynamic raw) {
  if (raw is String) {
    final t = raw.trim();
    if (t.isEmpty) return '';
    return t.length >= 10 ? t.substring(0, 10) : t;
  }
  if (raw is Timestamp) {
    return arenaDateKey(raw.toDate());
  }
  if (raw is DateTime) {
    return arenaDateKey(raw);
  }
  return '';
}
