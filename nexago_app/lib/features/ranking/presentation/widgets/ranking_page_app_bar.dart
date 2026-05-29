import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../../tournaments/presentation/widgets/compete_hub/compete_hub_shell_app_bar.dart';

class RankingPageAppBar extends StatelessWidget implements PreferredSizeWidget {
  const RankingPageAppBar({
    super.key,
    required this.searchOpen,
    required this.searchController,
    required this.onSearchToggle,
    required this.onFilterTap,
  });

  final bool searchOpen;
  final TextEditingController searchController;
  final VoidCallback onSearchToggle;
  final VoidCallback onFilterTap;

  @override
  Size get preferredSize =>
      Size.fromHeight(kToolbarHeight + (searchOpen ? 52 : 0));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppBar(
      centerTitle: false,
      titleSpacing: ArenaDashboardTokens.horizontalPadding,
      title: searchOpen
          ? TextField(
              controller: searchController,
              autofocus: true,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurface,
              ),
              decoration: InputDecoration(
                hintText: 'Buscar no ranking…',
                hintStyle: TextStyle(color: AppColors.onSurfaceMuted),
                border: InputBorder.none,
                isDense: true,
              ),
            )
          : Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Ranking',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
            ),
      actions: [
        CompeteHubAppBarIconButton(
          icon: searchOpen ? Icons.close_rounded : Icons.search_rounded,
          onTap: onSearchToggle,
        ),
        const SizedBox(width: 10),
        CompeteHubAppBarIconButton(
          icon: Icons.tune_rounded,
          onTap: onFilterTap,
        ),
        const SizedBox(width: 8),
      ],
      bottom: searchOpen
          ? null
          : null,
    );
  }
}
