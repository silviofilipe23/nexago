import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

/// Artes do hero da home, uma por gênero.
abstract final class AthleteHomeHeroArt {
  AthleteHomeHeroArt._();

  static const String masculino = 'assets/images/home/hero_masculino.webp';
  static const String feminino = 'assets/images/home/hero_feminino.webp';

  /// Quadra vazia — usada por quem não declarou gênero.
  static const String neutro = 'assets/images/home/hero_neutro.webp';
}

/// Escolhe a arte do hero a partir do `gender` cru do perfil.
///
/// `AthleteProfile.gender` é `String?` livre: o formulário oferece
/// 'Masculino'/'Feminino', mas o campo aceita nulo, vazio e valores legados.
/// Casa por prefixo em minúsculas — mesmo critério de
/// `athleteGenderShortLabel` e do filtro do Descobrir — e manda TUDO que não
/// for reconhecido para o neutro. Nunca cai no masculino por omissão.
String athleteHomeHeroAssetFor(String? gender) {
  final g = gender?.trim().toLowerCase() ?? '';
  if (g.startsWith('masc')) return AthleteHomeHeroArt.masculino;
  if (g.startsWith('fem')) return AthleteHomeHeroArt.feminino;
  return AthleteHomeHeroArt.neutro;
}

/// "Bom dia/Boa tarde/Boa noite" pelo horário local.
String athleteHomeGreetingByHour(DateTime now) {
  if (now.hour < 12) return 'Bom dia';
  if (now.hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/// Altura da arte abaixo da barra de status. O hero sangra para cima, então a
/// altura total soma o recorte do sistema.
const double _heroContentHeight = 250;

/// Véu de duas pontas. Medi as artes: a metade DIREITA da faixa da barra de
/// status chega a p95 142, e os ícones do sistema sumiriam ali. O topo escuro
/// resolve isso. O miolo fica aberto para a arte respirar.
///
/// O pé termina na COR DO FUNDO da página, não em preto fixo: assim a arte
/// dissolve sem costura visível, e no tema claro não cria uma faixa preta
/// batendo num canvas claro.
LinearGradient _scrimTo(Color canvas) => LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xB3000000),
        const Color(0x00000000),
        const Color(0x00000000),
        canvas.withValues(alpha: 0.86),
        canvas,
      ],
      stops: const [0, 0.22, 0.52, 0.86, 1],
    );

/// Hero da home do atleta: arte por gênero sangrando sob a barra de status,
/// saudação à esquerda e dois encaixes nos cantos direitos.
///
/// O texto usa branco fixo em vez de `onSurface`: as artes são escuras nos dois
/// temas, então no tema claro `onSurface` escureceria e sumiria na foto.
///
/// [topRight] e [bottomRight] existem porque a medição das artes mostrou que
/// esses dois cantos são os mais claros (p95 164 e 115 no masculino) — o que
/// for colocado neles precisa de fundo próprio, como a cápsula do sino e a
/// pílula de XP. O hero não conhece notificação nem gamificação: quem compõe
/// é a página.
class AthleteHomeHero extends StatelessWidget {
  const AthleteHomeHero({
    super.key,
    required this.name,
    required this.gender,
    this.tagline,
    this.leading,
    this.topRight,
    this.bottomRight,
    this.bleedBelow = 0,
    this.now,
  });

  /// Nome já resolvido pela página (primeiro nome, apelido, o que for).
  final String name;

  /// `gender` cru do perfil — pode ser nulo.
  final String? gender;

  /// Linha de apoio sob a saudação.
  final String? tagline;

  /// Fica à esquerda da saudação, dentro da faixa escura da arte. Ex.: avatar.
  final Widget? leading;

  /// Canto superior direito, sob a barra de status. Ex.: sino.
  final Widget? topRight;

  /// Canto inferior direito. Ex.: pílula de XP.
  final Widget? bottomRight;

  /// Quanto o hero encolhe para a primeira seção da página subir contra a
  /// imagem.
  ///
  /// NÃO é sangria de pintura. Num `CustomScrollView` os slivers pintam em
  /// ordem inversa — o primeiro pinta por CIMA —, então arte vazando para
  /// baixo cobriria o topo do card em vez de ficar atrás dele. Quem faz a
  /// emenda sumir é o degradê do pé, que morre na cor do fundo da página.
  final double bleedBelow;

  /// Injetável para teste; em produção é a hora do aparelho.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    final greeting = athleteHomeGreetingByHour(now ?? DateTime.now());
    final trimmedName = name.trim();
    final title =
        trimmedName.isEmpty ? '$greeting.' : '$greeting, $trimmedName.';

    final canvas = context.themeColors.canvas;

    return SizedBox(
      height: topInset + _heroContentHeight - bleedBelow,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Fundo escuro fixo: se a arte falhar, o texto branco ainda lê.
          const ColoredBox(color: AppColors.canvas),
          _HeroArt(gender: gender),
          DecoratedBox(decoration: BoxDecoration(gradient: _scrimTo(canvas))),
          Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              topInset + AppSpacing.xxxl,
              AppSpacing.screenH,
              AppSpacing.lg,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // A saudação ocupa só a faixa esquerda, que é a parte escura
                // das três artes (p95 entre 56 e 74).
                FractionallySizedBox(
                  // Sem o avatar a saudação cabe em 72%; com ele o grupo
                  // precisa de mais faixa, mas sem alcançar o canto claro
                  // onde mora o sino.
                  widthFactor: leading == null ? 0.72 : 0.82,
                  alignment: Alignment.centerLeft,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (leading != null) ...[
                        leading!,
                        const SizedBox(width: AppSpacing.md),
                      ],
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.titleL.copyWith(
                                color: AppColors.white,
                              ),
                            ),
                            if (tagline != null) ...[
                              const SizedBox(height: AppSpacing.xs),
                              Text(
                                tagline!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.bodyS.copyWith(
                                  color: AppColors.white.withValues(
                                    alpha: 0.72,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (topRight != null)
            Positioned(
              top: topInset + AppSpacing.sm,
              right: AppSpacing.screenH,
              child: topRight!,
            ),
          if (bottomRight != null)
            Positioned(
              bottom: AppSpacing.lg,
              right: AppSpacing.screenH,
              child: bottomRight!,
            ),
        ],
      ),
    );
  }
}

/// A arte em si, decodificada na largura em que aparece.
class _HeroArt extends StatelessWidget {
  const _HeroArt({required this.gender});

  final String? gender;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final cacheWidth = maxWidth.isFinite && maxWidth > 0
            ? (maxWidth * MediaQuery.devicePixelRatioOf(context)).round()
            : null;

        return Image.asset(
          athleteHomeHeroAssetFor(gender),
          fit: BoxFit.cover,
          cacheWidth: cacheWidth,
          // Decorativa: quem carrega o significado é a saudação.
          excludeFromSemantics: true,
        );
      },
    );
  }
}
