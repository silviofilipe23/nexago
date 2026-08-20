import 'package:flutter/material.dart';

import '../../../../../core/text/safe_display_text.dart';
import '../../../../../core/theme/app_colors.dart';

TextSpan buildArenaSearchHighlightedName(
  BuildContext context,
  String value,
  String query, {
  TextStyle? baseStyle,
  Color? highlightColor,
}) {
  final theme = Theme.of(context);
  final safe = sanitizeUtf16(value);
  final q = query.trim();
  final base = baseStyle ??
      theme.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w800,
      );
  if (q.isEmpty) {
    return TextSpan(text: safe, style: base);
  }

  final match = RegExp(RegExp.escape(q), caseSensitive: false).firstMatch(safe);
  if (match == null) {
    return TextSpan(text: safe, style: base);
  }

  final i = match.start;
  final end = match.end;
  return TextSpan(
    style: base,
    children: [
      if (i > 0) TextSpan(text: safe.substring(0, i)),
      TextSpan(
        text: safe.substring(i, end),
        style: base?.copyWith(
          color: highlightColor ?? AppColors.brand,
          decoration: TextDecoration.underline,
          decorationColor:
              (highlightColor ?? AppColors.brand).withValues(alpha: 0.55),
        ),
      ),
      if (end < safe.length) TextSpan(text: safe.substring(end)),
    ],
  );
}

Color arenaSearchTintColor(String arenaId) {
  final hash = arenaId.hashCode.abs();
  final hues = [
    const Color(0xFF0D1F14),
    const Color(0xFF1A1408),
    const Color(0xFF0D1520),
    const Color(0xFF1A0D14),
  ];
  return hues[hash % hues.length];
}
