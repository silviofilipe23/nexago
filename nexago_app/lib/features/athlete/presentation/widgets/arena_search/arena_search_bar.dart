import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

class ArenaSearchBar extends StatefulWidget {
  const ArenaSearchBar({
    super.key,
    required this.initialValue,
    required this.onChanged,
  });

  final String initialValue;
  final ValueChanged<String> onChanged;

  @override
  State<ArenaSearchBar> createState() => _ArenaSearchBarState();
}

class _ArenaSearchBarState extends State<ArenaSearchBar> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void didUpdateWidget(covariant ArenaSearchBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialValue != _controller.text) {
      _controller.text = widget.initialValue;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return TextField(
      controller: _controller,
      onChanged: widget.onChanged,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: AppColors.onSurface,
        fontWeight: FontWeight.w600,
      ),
      decoration: InputDecoration(
        hintText: 'Buscar arena, bairro ou cidade',
        hintStyle: theme.textTheme.bodyMedium?.copyWith(
          color: AppColors.onSurfaceMuted,
        ),
        prefixIcon: const Icon(
          Icons.search_rounded,
          color: AppColors.onSurfaceMuted,
        ),
        filled: true,
        fillColor: AppColors.surfaceCard,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.surfaceRaised),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.surfaceRaised),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.brand.withValues(alpha: 0.6)),
        ),
      ),
    );
  }
}
