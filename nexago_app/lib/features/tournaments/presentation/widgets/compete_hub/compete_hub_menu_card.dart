import 'package:flutter/material.dart';

import '../../../../../core/theme/app_borders.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Artes de fundo dos cards do hub Competir.
abstract final class CompeteHubArt {
  CompeteHubArt._();

  static const String tournaments = 'assets/images/compete/torneios.webp';
  static const String ranking = 'assets/images/compete/ranking.webp';
  static const String teams = 'assets/images/compete/equipes.webp';
  static const String athletes = 'assets/images/compete/atletas.webp';
}

/// Escurecimento da arte inteira: multiplica os canais por ~0,65. O preto
/// continua preto e só os altos-luzes cedem — um véu chapado por cima lavaria
/// a foto de cinza. Ajuste aqui para clarear (mais perto de 0xFF) ou escurecer.
const ColorFilter _artDim = ColorFilter.mode(
  Color(0xFFA6A6A6),
  BlendMode.multiply,
);

/// Véu que escurece o pé do card. As artes já morrem em preto embaixo, mas o
/// degradê garante o contraste do texto mesmo se a arte for trocada.
const LinearGradient _scrim = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [Color(0x00000000), Color(0x73000000), Color(0xE6000000)],
  stops: [0.20, 0.52, 1],
);

/// Card de navegação do hub Competir: arte sangrando no fundo, véu escuro,
/// título, descrição e seta no canto.
///
/// O texto usa branco fixo em vez de `onSurface`: as artes são escuras nos
/// dois temas, então no tema claro `onSurface` escureceria e sumiria na foto.
class CompeteHubMenuCard extends StatefulWidget {
  const CompeteHubMenuCard({
    super.key,
    required this.imageAsset,
    required this.title,
    required this.description,
    required this.onTap,
  });

  /// Proporção largura/altura do card (retrato).
  static const double aspectRatio = 0.78;

  /// Quanto o card encolhe enquanto está sob o dedo.
  static const double pressedScale = 0.96;

  final String imageAsset;
  final String title;
  final String description;
  final VoidCallback onTap;

  @override
  State<CompeteHubMenuCard> createState() => _CompeteHubMenuCardState();
}

class _CompeteHubMenuCardState extends State<CompeteHubMenuCard> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return AspectRatio(
      aspectRatio: CompeteHubMenuCard.aspectRatio,
      child: AnimatedScale(
        scale: _pressed ? CompeteHubMenuCard.pressedScale : 1,
        duration: AppMotion.fast,
        curve: AppMotion.curve,
        child: LayoutBuilder(
          builder: (context, constraints) => Material(
            color: colors.surfaceCard,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: AppRadii.lgAll,
              side: AppBorders.baseSide(colors),
            ),
            child: Ink.image(
              image: _imageProvider(context, constraints.maxWidth),
              colorFilter: _artDim,
              fit: BoxFit.cover,
              child: InkWell(
                onTap: widget.onTap,
                // Reusa o InkWell que já existe para o ripple em vez de
                // empilhar um GestureDetector disputando a arena de gestos:
                // escala e ripple saem do mesmo sinal e andam juntos.
                onHighlightChanged: _setPressed,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const DecoratedBox(
                      decoration: BoxDecoration(gradient: _scrim),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.md + 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.titleS.copyWith(
                              color: AppColors.white,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Flexible(
                            child: Text(
                              widget.description,
                              maxLines: 4,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 10,
                                height: 1.3,
                                color: AppColors.white.withValues(alpha: 0.74),
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm + 2),
                          const Align(
                            alignment: Alignment.centerRight,
                            child: Icon(
                              Icons.arrow_forward_rounded,
                              size: 17,
                              color: AppColors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Decodifica a arte no tamanho em que ela aparece, não nos 1024x1536 do
  /// arquivo — sem isso os quatro cards seguram ~24 MB de bitmap em memória.
  ImageProvider _imageProvider(BuildContext context, double maxWidth) {
    final base = AssetImage(widget.imageAsset);
    if (!maxWidth.isFinite || maxWidth <= 0) return base;

    final width = (maxWidth * MediaQuery.devicePixelRatioOf(context)).round();
    return ResizeImage(base, width: width, allowUpscaling: false);
  }
}
