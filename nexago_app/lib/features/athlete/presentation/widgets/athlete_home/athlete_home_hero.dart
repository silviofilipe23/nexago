import 'package:flutter/material.dart';

import '../../../../../core/sports/sport_catalog.dart';
import '../../../domain/sport_art_catalog.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
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
///
/// [sport] (código Firestore ou rótulo) tem precedência: as artes por gênero
/// mostram vôlei de praia, então quem joga outra coisa não pode vê-las.
/// 1. esporte com arte por gênero (`assets/images/home/sport/`) + gênero
///    reconhecido → a arte do esporte naquele gênero;
/// 2. esporte com arte no catálogo (`SportArtCatalog`) e gênero não
///    reconhecido → a arte neutra do esporte;
/// 3. vôlei de praia, esporte sem arte (outros) e nulo → arte por gênero.
String athleteHomeHeroAssetFor(String? gender, {String? sport}) {
  final g = gender?.trim().toLowerCase() ?? '';
  final isMasc = g.startsWith('masc');
  final isFem = g.startsWith('fem');

  final code = SportCatalog.profileCodeOf(sport);
  if (code != null && code != 'VOLEI_PRAIA') {
    final slug = _heroSportSlugByCode[code];
    if (slug != null && (isMasc || isFem)) {
      return 'assets/images/home/sport/${slug}_${isMasc ? 'masculino' : 'feminino'}.webp';
    }
    final sportArt = SportArtCatalog.assetFor(sport);
    if (sportArt != null) return sportArt;
  }
  if (isMasc) return AthleteHomeHeroArt.masculino;
  if (isFem) return AthleteHomeHeroArt.feminino;
  return AthleteHomeHeroArt.neutro;
}

/// Esportes com arte do hero nos dois gêneros
/// (`assets/images/home/sport/<slug>_{masculino,feminino}.webp`).
const _heroSportSlugByCode = <String, String>{
  'VOLEI_QUADRA': 'volei_quadra',
  'FUTEVOLEI': 'futevolei',
  'BEACH_TENNIS': 'beach_tennis',
  'TENIS': 'tenis',
  'PADEL': 'padel',
  'BASQUETE': 'basquete',
  'FUTEBOL': 'futebol',
  'CORRIDA': 'corrida',
};

/// Altura da arte abaixo da barra de status. O hero sangra para cima, então a
/// altura total soma o recorte do sistema.
///
/// A pílula do canto inferior acompanha essa altura: com o avatar de 56 e o
/// recorte de 56 da home, 220 deixa 24 entre o nome e a pílula de XP.
const double _heroContentHeight = 200;

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
/// nome à esquerda e dois encaixes nos cantos direitos.
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
    this.sport,
    this.tagline,
    this.leading,
    this.topRight,
    this.bottomRight,
    this.onIdentityTap,
    this.identitySemanticLabel,
    this.bleedBelow = 0,
  });

  /// Nome já resolvido pela página (primeiro nome, apelido, o que for).
  final String name;

  /// `gender` cru do perfil — pode ser nulo.
  final String? gender;

  /// Esporte principal do perfil (código Firestore ou rótulo) — pode ser nulo.
  final String? sport;

  /// Linha de apoio sob o nome.
  final String? tagline;

  /// Fica à esquerda do nome, dentro da faixa escura da arte. Ex.: avatar.
  final Widget? leading;

  /// Canto superior direito, sob a barra de status. Ex.: sino.
  final Widget? topRight;

  /// Canto inferior direito. Ex.: pílula de XP.
  final Widget? bottomRight;

  /// Toque no grupo [leading] + nome. Com ele o grupo inteiro vira um
  /// botão e o nome ganha a seta ⌄ — o avatar sozinho não dizia que abria
  /// um menu, e os atletas não achavam perfil e configurações.
  final VoidCallback? onIdentityTap;

  /// O que o leitor de tela anuncia para o grupo quando há [onIdentityTap].
  final String? identitySemanticLabel;

  /// Quanto o hero encolhe para a primeira seção da página subir contra a
  /// imagem.
  ///
  /// NÃO é sangria de pintura. Num `CustomScrollView` os slivers pintam em
  /// ordem inversa — o primeiro pinta por CIMA —, então arte vazando para
  /// baixo cobriria o topo do card em vez de ficar atrás dele. Quem faz a
  /// emenda sumir é o degradê do pé, que morre na cor do fundo da página.
  final double bleedBelow;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    // Só o nome: o "Bom dia, Fulano." ocupava duas linhas ao lado do avatar e
    // empurrava a pílula; sem saudação o topo fica mais curto.
    final trimmedName = name.trim();
    final title = trimmedName.isEmpty ? 'Atleta' : trimmedName;

    final canvas = context.themeColors.canvas;
    final titleStyle = AppTypography.titleL.copyWith(
      color: AppColors.white,
      fontSize: 18,
    );

    Widget identity = Row(
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
              Text.rich(
                TextSpan(
                  text: title,
                  children: [
                    if (onIdentityTap != null)
                      WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: Padding(
                          padding: const EdgeInsets.only(left: 2),
                          child: Icon(
                            Icons.expand_more_rounded,
                            key: const Key('athlete-home-identity-chevron'),
                            size: 22,
                            color: AppColors.white.withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                  ],
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: titleStyle,
              ),
              if (tagline != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  tagline!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    color: AppColors.white.withValues(alpha: 0.72),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
    if (onIdentityTap case final onTap?) {
      identity = Semantics(
        button: true,
        label: identitySemanticLabel,
        excludeSemantics: identitySemanticLabel != null,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            key: const Key('athlete-home-identity'),
            onTap: onTap,
            borderRadius: AppRadii.mdAll,
            child: identity,
          ),
        ),
      );
    }

    return SizedBox(
      height: topInset + _heroContentHeight - bleedBelow,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Fundo escuro fixo: se a arte falhar, o texto branco ainda lê.
          const ColoredBox(color: AppColors.canvas),
          _HeroArt(gender: gender, sport: sport),
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
                // O nome ocupa só a faixa esquerda, que é a parte escura
                // das três artes (p95 entre 56 e 74).
                FractionallySizedBox(
                  // Sem o avatar o nome cabe em 72%; com ele o grupo
                  // precisa de mais faixa, mas sem alcançar o canto claro
                  // onde mora o sino.
                  widthFactor: leading == null ? 0.72 : 0.82,
                  alignment: Alignment.centerLeft,
                  child: identity,
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
  const _HeroArt({required this.gender, this.sport});

  final String? gender;
  final String? sport;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final cacheWidth = maxWidth.isFinite && maxWidth > 0
            ? (maxWidth * MediaQuery.devicePixelRatioOf(context)).round()
            : null;

        return Image.asset(
          athleteHomeHeroAssetFor(gender, sport: sport),
          fit: BoxFit.cover,
          cacheWidth: cacheWidth,
          // Decorativa: quem carrega o significado é o nome.
          excludeFromSemantics: true,
        );
      },
    );
  }
}
