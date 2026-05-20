import 'package:flutter/material.dart';

/// Tokens NexaGO (design system 03 — Color).
abstract final class AppColors {
  AppColors._();

  // Brand — Orange
  static const Color brand = Color(0xFFFF6A1A);
  static const Color brandHover = Color(0xFFFF8A4A);
  static const Color brandPressed = Color(0xFFE5560E);

  // Surfaces — Dark (native)
  static const Color canvas = Color(0xFF050505);
  static const Color surfaceCard = Color(0xFF0B0B0C);
  static const Color surfaceRaised = Color(0xFF131316);
  static const Color surfaceSheet = Color(0xFF1B1B1F);

  // Light mode canvas
  static const Color canvasLight = Color(0xFFFAF8F4);

  // Status & semantics
  static const Color live = Color(0xFFFF3B30);
  static const Color win = Color(0xFF2BD17E);
  static const Color pending = Color(0xFFF4C543);

  // Text
  static const Color onSurface = Color(0xFFF5F5F7);
  static const Color onSurfaceMuted = Color(0xFF9A9AA3);
  static const Color onSurfaceLight = Color(0xFF1C1C1E);
  static const Color onSurfaceMutedLight = Color(0xFF6A6A6A);

  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);
}
