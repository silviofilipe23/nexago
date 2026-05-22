import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

/// Decoração compartilhada dos campos em Editar perfil.
InputDecoration editProfileInputDecoration({
  required String label,
  bool required = false,
  String? hintText,
  String? helperText,
  Widget? prefixIcon,
  Widget? suffixIcon,
  bool focused = false,
}) {
  final labelText = required ? '$label *' : label;
  final borderColor = focused
      ? AppColors.brand
      : AppColors.onSurfaceMuted.withValues(alpha: 0.25);

  return InputDecoration(
    labelText: labelText,
    labelStyle: TextStyle(
      color: focused ? AppColors.brand : AppColors.onSurfaceMuted,
      fontSize: 10,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.5,
    ),
    floatingLabelStyle: TextStyle(
      color: focused ? AppColors.brand : AppColors.onSurfaceMuted,
      fontSize: 10,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.5,
    ),
    hintText: hintText,
    hintStyle: TextStyle(
      color: AppColors.onSurfaceMuted.withValues(alpha: 0.6),
      fontWeight: FontWeight.w500,
    ),
    helperText: helperText,
    helperStyle: TextStyle(
      color: AppColors.onSurfaceMuted.withValues(alpha: 0.85),
      fontSize: 12,
    ),
    prefixIcon: prefixIcon,
    suffixIcon: suffixIcon,
    filled: true,
    fillColor: AppColors.surfaceRaised,
    contentPadding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: borderColor),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: borderColor),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: AppColors.live),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: AppColors.live, width: 1.5),
    ),
    disabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(
        color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
      ),
    ),
  );
}
