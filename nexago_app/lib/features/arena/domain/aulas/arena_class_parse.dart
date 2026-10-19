import 'package:cloud_firestore/cloud_firestore.dart';

// Parse defensivo dos docs de Aulas — tolera tipo errado/vazio (mesma
// convenção de `ArenaClub` e `ArenaRecurringBooking`).

String parseString(Object? v, String fallback) {
  if (v is! String) return fallback;
  final t = v.trim();
  return t.isEmpty ? fallback : t;
}

String? parseStringOrNull(Object? v) {
  if (v is! String) return null;
  final t = v.trim();
  return t.isEmpty ? null : t;
}

int parseInt(Object? v, int fallback) => v is num ? v.toInt() : fallback;

/// `HH:mm` (corta segundos se vierem).
String parseHm(Object? v) {
  if (v is! String) return '';
  final t = v.trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

DateTime? parseTimestamp(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  return null;
}

List<String> parseStringList(Object? v) {
  if (v is! List) return const [];
  return [
    for (final e in v)
      if (e is String && e.trim().isNotEmpty) e.trim(),
  ];
}
