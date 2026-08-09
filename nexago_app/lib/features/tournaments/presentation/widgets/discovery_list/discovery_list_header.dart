import 'package:flutter/material.dart';

import '../../../../../core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_icon_square_button.dart';

/// Cabeçalho da lista de descoberta: título, botão de busca e campo de
/// busca expansível.
class DiscoveryListHeader extends StatelessWidget {
  const DiscoveryListHeader({
    super.key,
    required this.searching,
    required this.controller,
    required this.focusNode,
    required this.onBack,
    required this.onToggleSearch,
  });

  final bool searching;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onBack;
  final VoidCallback onToggleSearch;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              onPressed: onBack,
              icon: Icon(Icons.arrow_back_rounded),
              color: context.themeColors.onSurface,
            ),
            Expanded(
              child: Text(
                'Explorar',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            NexaIconSquareButton(
              icon: Icons.search_rounded,
              onTap: onToggleSearch,
            ),
          ],
        ),
        if (searching) ...[
          SizedBox(height: 12),
          TextField(
            controller: controller,
            focusNode: focusNode,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: context.themeColors.onSurface,
              fontWeight: FontWeight.w700,
            ),
            decoration: InputDecoration(
              hintText: 'Buscar torneios e ligas…',
              hintStyle: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
              filled: true,
              fillColor: context.themeColors.surfaceRaised,
              prefixIcon: Icon(
                Icons.search_rounded,
                color: context.themeColors.onSurfaceMuted,
              ),
              suffixIcon: IconButton(
                onPressed: () => controller.clear(),
                icon: Icon(
                  Icons.close_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              border: OutlineInputBorder(
                borderRadius: AppRadii.mdAll,
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
