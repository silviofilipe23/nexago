import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

TextSpan buildArenaSearchHighlightedName(
  BuildContext context,
  String value,
  String query, {
  TextStyle? baseStyle,
  Color? highlightColor,
}) {
  final theme = Theme.of(context);
  final q = query.trim();
  final base = baseStyle ??
      theme.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w800,
      );
  if (q.isEmpty) {
    return TextSpan(text: value, style: base);
  }

  final source = value.toLowerCase();
  final needle = q.toLowerCase();
  final i = source.indexOf(needle);
  if (i < 0) {
    return TextSpan(text: value, style: base);
  }

  final end = i + needle.length;
  return TextSpan(
    style: base,
    children: [
      if (i > 0) TextSpan(text: value.substring(0, i)),
      TextSpan(
        text: value.substring(i, end),
        style: base?.copyWith(
          color: highlightColor ?? AppColors.brand,
          decoration: TextDecoration.underline,
          decorationColor:
              (highlightColor ?? AppColors.brand).withValues(alpha: 0.55),
        ),
      ),
      if (end < value.length) TextSpan(text: value.substring(end)),
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
