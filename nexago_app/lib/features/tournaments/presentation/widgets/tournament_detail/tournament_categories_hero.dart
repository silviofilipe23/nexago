import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Altura da arte abaixo da barra de status. O hero sangra para cima, então a
/// altura total soma o recorte do sistema — mesmo desenho do hero da home.
const double _heroContentHeight = 224;

/// Véu de duas pontas, irmão do `_scrimTo` do hero da home.
///
/// O topo escuro existe para a barra de status, o voltar e o título lerem
/// sobre qualquer capa — inclusive uma clara, enviada pelo organizador. O pé
/// termina na COR DO FUNDO da página (e não em preto fixo) para a arte
/// dissolver sem costura, e para o tema claro não ganhar uma faixa preta.
LinearGradient _scrimTo(Color canvas) => LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xCC000000),
        const Color(0x33000000),
        const Color(0x40000000),
        canvas.withValues(alpha: 0.88),
        canvas,
      ],
      stops: const [0, 0.26, 0.5, 0.88, 1],
    );

/// Cabeçalho da aba de categorias: arte do app ocupando o header inteiro, com
/// o voltar e o título por cima dela.
///
/// A arte é SEMPRE a do app, nunca a capa do torneio: a capa já identifica o
/// torneio no detalhe, e uma imagem enviada pelo organizador não se compromete
/// a ter área escura no topo onde o voltar e o título precisam ler.
///
/// É um [SliverAppBar] fixo: a arte encolhe ao rolar até sobrar só a barra,
/// então o voltar nunca sai da tela e a lista não perde altura permanente.
class TournamentCategoriesSliverHero extends StatelessWidget {
  const TournamentCategoriesSliverHero({super.key, required this.onBack});

  final VoidCallback onBack;

  static const String _art = 'assets/images/home/hero_neutro.webp';

  @override
  Widget build(BuildContext context) {
    final canvas = context.themeColors.canvas;
    final topInset = MediaQuery.paddingOf(context).top;

    return SliverAppBar(
      pinned: true,
      expandedHeight: topInset + _heroContentHeight,
      backgroundColor: canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      automaticallyImplyLeading: false,
      centerTitle: true,
      leading: Center(child: _BackButton(onBack: onBack)),
      // Branco fixo, não `onSurface`: o título fica sobre a arte escura nos
      // dois temas, e no claro `onSurface` sumiria dentro da foto.
      title: Text(
        'Categorias',
        style: AppTypography.soraRegular(
          fontSize: 17,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
        ),
      ),
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            // Fundo escuro fixo: se a arte falhar, o texto branco ainda lê.
            const ColoredBox(color: AppColors.canvas),
            const _HeroArt(asset: _art),
            DecoratedBox(
              decoration: BoxDecoration(gradient: _scrimTo(canvas)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'Escolha sua\n',
                          style: AppTypography.soraRegular(
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            color: AppColors.white,
                            height: 1.1,
                            letterSpacing: -0.6,
                          ),
                        ),
                        TextSpan(
                          text: 'categoria',
                          style: AppTypography.soraRegular(
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            color: AppColors.brand,
                            height: 1.1,
                            letterSpacing: -0.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Diferentes níveis, mais jogos, mais histórias.',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.white.withValues(alpha: 0.72),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Cápsula própria: sem ela o ícone se perde numa capa clara.
class _BackButton extends StatelessWidget {
  const _BackButton({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.black.withValues(alpha: 0.4),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onBack,
        child: const SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            Icons.arrow_back_rounded,
            size: 21,
            color: AppColors.white,
          ),
        ),
      ),
    );
  }
}

class _HeroArt extends StatelessWidget {
  const _HeroArt({required this.asset});

  final String asset;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final cacheWidth = maxWidth.isFinite && maxWidth > 0
            ? (maxWidth * MediaQuery.devicePixelRatioOf(context)).round()
            : null;

        return Image.asset(
          asset,
          fit: BoxFit.cover,
          cacheWidth: cacheWidth,
          // Decorativa: quem carrega o significado é o título.
          excludeFromSemantics: true,
          errorBuilder: (_, _, _) => const SizedBox.shrink(),
        );
      },
    );
  }
}
