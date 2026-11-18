import 'package:flutter/foundation.dart';


enum ArenaDashboardKpiBadgeTone { positive, negative, neutral }

@immutable
class ArenaDashboardKpiBadge {
  const ArenaDashboardKpiBadge({
    required this.label,
    required this.tone,
  });

  final String label;
  final ArenaDashboardKpiBadgeTone tone;
}
