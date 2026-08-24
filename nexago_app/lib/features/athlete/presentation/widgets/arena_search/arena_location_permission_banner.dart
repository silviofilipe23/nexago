import 'package:flutter/material.dart';

import '../../../../../core/location/location_permission_status.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Caminho de volta para quem já recusou a localização (ou desligou o GPS).
///
/// Só aparece quando o diálogo do sistema não aparece mais: sem ela o atleta
/// fica com o mapa longe de casa e nenhuma pista do porquê. Fina de propósito —
/// sobre o mapa, cada linha a mais é mapa a menos, e isto é um aviso, não a
/// tarefa da tela.
class ArenaLocationPermissionBanner extends StatelessWidget {
  const ArenaLocationPermissionBanner({
    super.key,
    required this.nudge,
    required this.onOpenSettings,
  });

  final LocationSettingsNudge nudge;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpenSettings,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.surfaceRaised),
            boxShadow: [
              BoxShadow(
                color: AppColors.black.withValues(alpha: 0.14),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          child: Row(
            children: [
              Icon(
                Icons.location_off_rounded,
                size: 16,
                color: colors.onSurfaceMuted,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  nudge.message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              const Text(
                'ATIVAR',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.4,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 8),
            ],
          ),
        ),
      ),
    );
  }
}
