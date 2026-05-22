import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

/// Cabeçalho de seção do formulário Editar perfil (protótipo 11).
class EditProfileSectionHeader extends StatelessWidget {
  const EditProfileSectionHeader({
    super.key,
    required this.icon,
    required this.title,
  });

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.brand),
          const SizedBox(width: 8),
          Text(
            title,
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              fontSize: 10,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              height: 1,
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
          ),
        ],
      ),
    );
  }
}
