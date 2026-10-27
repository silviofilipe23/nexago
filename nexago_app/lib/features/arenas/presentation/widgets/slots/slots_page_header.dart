import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

class SlotsPageHeader extends StatelessWidget {
  const SlotsPageHeader({
    super.key,
    required this.title,
    required this.onBack,
    this.coverUrl,
  });

  final String title;
  final VoidCallback onBack;

  /// Capa da arena (`coverUrl`, a mesma do perfil). Com ela o cabeçalho vira a
  /// foto, com voltar e título por cima; sem ela fica a barra simples — nada de
  /// foto de banco de imagem fingindo ser a arena.
  final String? coverUrl;

  @override
  Widget build(BuildContext context) {
    final cover = coverUrl?.trim() ?? '';
    if (cover.isNotEmpty) {
      return _CoverHeader(title: title, onBack: onBack, coverUrl: cover);
    }

    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      child: Row(
        children: [
          _IconButton(icon: Icons.arrow_back_rounded, onTap: onBack),
          Expanded(
            child: Text(
              title,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w900,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

/// Cabeçalho com a capa da arena. Altura fixa e baixa de propósito: a lista de
/// horários embaixo é o que importa, e em tela pequena cada pixel dela conta.
class _CoverHeader extends StatelessWidget {
  const _CoverHeader({
    required this.title,
    required this.onBack,
    required this.coverUrl,
  });

  static const double height = 132;

  final String title;
  final VoidCallback onBack;
  final String coverUrl;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final placeholder = ColoredBox(color: context.themeColors.surfaceCard);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          height: height,
          child: Stack(
            fit: StackFit.expand,
            children: [
              CachedNetworkImage(
                imageUrl: coverUrl,
                fit: BoxFit.cover,
                fadeInDuration: const Duration(milliseconds: 220),
                placeholder: (context, _) => placeholder,
                errorWidget: (context, _, __) => placeholder,
              ),
              // Escurece o topo (botão) e a base (título): o texto é sempre
              // branco, então a foto não pode decidir o contraste — inclusive
              // no tema claro e enquanto a imagem ainda carrega.
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0, 0.4, 1],
                    colors: [
                      Colors.black.withValues(alpha: 0.35),
                      Colors.black.withValues(alpha: 0.1),
                      Colors.black.withValues(alpha: 0.72),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 8,
                top: 8,
                child: _CoverBackButton(onTap: onBack),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 12,
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CoverBackButton extends StatelessWidget {
  const _CoverBackButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.38),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: const SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            Icons.arrow_back_rounded,
            color: Colors.white,
            size: 22,
            semanticLabel: 'Voltar',
          ),
        ),
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  const _IconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, color: context.themeColors.onSurface, size: 22),
        ),
      ),
    );
  }
}
