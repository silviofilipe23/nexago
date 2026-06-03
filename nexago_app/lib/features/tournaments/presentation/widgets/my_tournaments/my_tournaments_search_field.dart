import 'package:flutter/material.dart';

import '../../../../../core/theme/app_theme_colors.dart';

class MyTournamentsSearchField extends StatelessWidget {
  const MyTournamentsSearchField({
    super.key,
    required this.controller,
    required this.onChanged,
    required this.onClose,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        autofocus: true,
        style: theme.textTheme.bodyMedium?.copyWith(
          color: context.themeColors.onSurface,
        ),
        decoration: InputDecoration(
          hintText: 'Buscar torneio…',
          hintStyle: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
          prefixIcon: Icon(
            Icons.search_rounded,
            color: context.themeColors.onSurfaceMuted,
            size: 22,
          ),
          suffixIcon: IconButton(
            icon: Icon(
              Icons.close_rounded,
              color: context.themeColors.onSurfaceMuted,
            ),
            onPressed: onClose,
          ),
          filled: true,
          fillColor: context.themeColors.surfaceCard,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.themeColors.surfaceRaised),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.themeColors.surfaceRaised),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(
              color: context.themeColors.brand.withValues(alpha: 0.6),
            ),
          ),
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }
}
