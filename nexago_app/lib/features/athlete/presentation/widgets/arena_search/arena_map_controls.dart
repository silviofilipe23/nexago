import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Botões que flutuam na borda direita do mapa, em duas cápsulas.
///
/// A separação não é estética: em cima ficam ações que levam o atleta para
/// outro lugar (favoritas, região da busca); embaixo, as que só mexem na
/// câmera. Misturar as duas faria o dedo errar o alvo o tempo todo.
class ArenaMapControls extends StatelessWidget {
  const ArenaMapControls({
    super.key,
    required this.onFavoritesTap,
    required this.onLocationTap,
    required this.onResetNorth,
    required this.onLocateMe,
    this.isLocating = false,
  });

  final VoidCallback onFavoritesTap;
  final VoidCallback onLocationTap;
  final VoidCallback onResetNorth;
  final VoidCallback onLocateMe;
  final bool isLocating;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _ControlCapsule(
          children: [
            _ControlButton(
              icon: Icons.favorite_border_rounded,
              tooltip: 'Arenas que eu sigo',
              onTap: onFavoritesTap,
            ),
            _ControlButton(
              icon: Icons.place_outlined,
              tooltip: 'Região da busca',
              onTap: onLocationTap,
            ),
          ],
        ),
        const SizedBox(height: 10),
        _ControlCapsule(
          children: [
            _ControlButton(
              icon: Icons.explore_outlined,
              tooltip: 'Voltar ao norte',
              onTap: onResetNorth,
            ),
            _ControlButton(
              icon: Icons.my_location_rounded,
              tooltip: 'Minha localização',
              onTap: isLocating ? null : onLocateMe,
              busy: isLocating,
            ),
          ],
        ),
      ],
    );
  }
}

class _ControlCapsule extends StatelessWidget {
  const _ControlCapsule({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.surfaceRaised),
        boxShadow: [
          BoxShadow(
            color: AppColors.black.withValues(alpha: 0.18),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(height: 1, thickness: 1, color: colors.surfaceRaised),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  const _ControlButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.busy = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 46,
          height: 46,
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.brand,
                    ),
                  )
                : Icon(icon, size: 20, color: colors.onSurface),
          ),
        ),
      ),
    );
  }
}
