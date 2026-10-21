import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../core/brand/nexa_hashtag.dart';
import '../../../../../core/deep_link/app_domains.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../auth/widgets/auth_form_widgets.dart' show kNexagoLogoAsset;
import '../../../domain/booking_story.dart';

/// A arte 9:16 do story da reserva na base 360×640 do protótipo — a página
/// captura em 3× (1080×1920). Cores fixas: é peça para o Instagram, não segue
/// o tema do app. Topo começa em 92 e o bloco de baixo termina em 124 para
/// fugir da barra de perfil e da caixa de resposta do story.
class BookingStoryCard extends StatelessWidget {
  const BookingStoryCard({
    super.key,
    required this.data,
    required this.theme,
    required this.infos,
    this.photo,
  });

  static const Size size = Size(360, 640);

  final BookingStoryData data;
  final BookingStoryTheme theme;
  final Set<BookingStoryInfo> infos;

  /// Fundo do tema [BookingStoryTheme.photo].
  final Uint8List? photo;

  static const Color darkInk = Color(0xFFF4F4F5);
  static const Color lightInk = Color(0xFF140A03);

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = light ? lightInk : darkInk;
    final sub = ink.withValues(alpha: light ? 0.72 : 0.78);
    final showSport =
        infos.contains(BookingStoryInfo.sport) && data.sportLabel != null;
    final showCrew =
        infos.contains(BookingStoryInfo.crew) && data.crew.isNotEmpty;

    final blocks = <Widget>[
      if (showSport)
        Text(
          data.sportLabel!,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.mono(
            fontSize: 10,
            letterSpacing: 1.6,
            color: light ? lightInk : AppColors.brandHover,
          ),
        ),
      Text(
        'Bora\njogar.',
        style: AppTypography.soraRegular(
          fontSize: 58,
          fontWeight: FontWeight.w800,
          letterSpacing: -2.32,
          height: 0.92,
          color: ink,
        ),
      ),
      if (infos.contains(BookingStoryInfo.time))
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              data.timeRange,
              style: AppTypography.mono(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.52,
                color: ink,
              ),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                data.dateLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.mono(
                  fontSize: 11,
                  letterSpacing: 1.1,
                  color: sub,
                ),
              ),
            ),
          ],
        ),
      if (infos.contains(BookingStoryInfo.arena))
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(Icons.place_outlined, size: 14, color: sub),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: data.arenaName,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: ink,
                      ),
                    ),
                    if (data.courtName.isNotEmpty)
                      TextSpan(text: ' · ${data.courtName}'),
                  ],
                ),
                // O bloco cresce para cima: nome longo de arena cabe em duas.
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: sub,
                ),
              ),
            ),
          ],
        ),
      if (showCrew) _CrewRow(crew: data.crew, light: light, ink: ink, sub: sub),
    ];

    return BookingStoryArtFrame(
      theme: theme,
      photo: photo,
      pillLabel: 'QUADRA GARANTIDA',
      pillColor: light ? lightInk : AppColors.win,
      pillTextColor: light ? const Color(0xFFE9D3B0) : const Color(0xFF062514),
      footerLabel: 'RESERVE TAMBÉM · ${AppDomains.siteHost.toUpperCase()}',
      blocksBottom: 124,
      blocks: blocks,
    );
  }
}

/// A moldura comum das artes de story (reserva e pós-jogo): fundo, marca +
/// selo no topo (92), o bloco de conteúdo ancorado embaixo e o rodapé (92).
/// Material próprio: a arte não herda (nem depende de) quem a hospeda.
class BookingStoryArtFrame extends StatelessWidget {
  const BookingStoryArtFrame({
    super.key,
    required this.theme,
    required this.pillLabel,
    required this.pillColor,
    required this.pillTextColor,
    required this.footerLabel,
    required this.blocksBottom,
    required this.blocks,
    this.photo,
    this.deepScrim = false,
  });

  final BookingStoryTheme theme;
  final Uint8List? photo;

  /// Escurecimento mais alto sobre a foto (o placar do pós-jogo sobe mais).
  final bool deepScrim;
  final String pillLabel;
  final Color pillColor;
  final Color pillTextColor;
  final String footerLabel;

  /// Distância do bloco até a base: foge da caixa de resposta do story.
  final double blocksBottom;

  /// Empilhados com 14 de respiro, crescendo para cima.
  final List<Widget> blocks;

  static Color inkOf(BookingStoryTheme theme) =>
      theme.isLight ? BookingStoryCard.lightInk : BookingStoryCard.darkInk;

  static Color subOf(BookingStoryTheme theme) =>
      inkOf(theme).withValues(alpha: theme.isLight ? 0.72 : 0.78);

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = inkOf(theme);
    final sub = subOf(theme);
    return Material(
      type: MaterialType.transparency,
      child: SizedBox.fromSize(
        size: BookingStoryCard.size,
        child: ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              BookingStoryBackground(
                theme: theme,
                photo: photo,
                deepScrim: deepScrim,
              ),
              Positioned(
                top: 92,
                left: 24,
                right: 24,
                child: Row(
                  children: [
                    BookingStoryWordmark(light: light, ink: ink),
                    const SizedBox(width: 12),
                    // Rótulos longos ("TREINO FINALIZADO") encolhem em vez de
                    // estourar a linha da marca.
                    Flexible(
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: pillColor,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              pillLabel,
                              style: AppTypography.mono(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.08,
                                height: 1,
                                color: pillTextColor,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 24,
                right: 24,
                bottom: blocksBottom,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < blocks.length; i++) ...[
                      if (i > 0) const SizedBox(height: 14),
                      blocks[i],
                    ],
                  ],
                ),
              ),
              Positioned(
                left: 24,
                right: 24,
                bottom: 92,
                child: DefaultTextStyle(
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w400,
                    letterSpacing: 1.08,
                    color: sub,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          footerLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(nexaHashtagStamp),
                    ],
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

/// Fundo de um tema — também é a miniatura do seletor de fundo.
class BookingStoryBackground extends StatelessWidget {
  const BookingStoryBackground({
    super.key,
    required this.theme,
    this.photo,
    this.deepScrim = false,
  });

  final BookingStoryTheme theme;
  final Uint8List? photo;

  /// Pós-jogo: a base escurece a partir de 36% (o placar ocupa mais altura).
  final bool deepScrim;

  @override
  Widget build(BuildContext context) {
    final bytes = photo;
    return switch (theme) {
      BookingStoryTheme.photo when bytes != null => Stack(
          fit: StackFit.expand,
          children: [
            Image.memory(
              bytes,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              errorBuilder: (_, _, _) =>
                  const ColoredBox(color: Color(0xFF0B0B0C)),
            ),
            // Escurece topo e base para o texto ler sobre qualquer foto.
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: deepScrim
                      ? const [
                          Color(0x8C050505),
                          Color(0x00050505),
                          Color(0x26050505),
                          Color(0xF0050505),
                        ]
                      : const [
                          Color(0x8C050505),
                          Color(0x00050505),
                          Color(0x00050505),
                          Color(0xEB050505),
                        ],
                  stops: deepScrim
                      ? const [0, 0.22, 0.36, 0.72]
                      : const [0, 0.22, 0.42, 0.82],
                ),
              ),
            ),
          ],
        ),
      BookingStoryTheme.photo => const ColoredBox(color: Color(0xFF0B0B0C)),
      BookingStoryTheme.ember => const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0.6, -0.8),
              radius: 1,
              colors: [AppColors.brand, Color(0xFF7A2A05), Color(0xFF120703)],
              stops: [0, 0.45, 1],
            ),
          ),
        ),
      // `gradient` anula `color` no BoxDecoration: o fundo opaco vem de fora,
      // senão o PNG sai transparente fora do brilho.
      BookingStoryTheme.night => ColoredBox(
          color: AppColors.canvas,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -0.44),
                radius: 0.75,
                colors: [
                  AppColors.brand.withValues(alpha: 0.28),
                  AppColors.brand.withValues(alpha: 0),
                ],
                stops: const [0, 0.7],
              ),
            ),
          ),
        ),
      BookingStoryTheme.sand => const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFE9D3B0), Color(0xFFC99A62)],
            ),
          ),
        ),
    };
  }
}

/// Marca + "nexaGO" com o GO laranja (escuro no fundo areia).
class BookingStoryWordmark extends StatelessWidget {
  const BookingStoryWordmark({
    super.key,
    required this.light,
    required this.ink,
  });

  final bool light;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          kNexagoLogoAsset,
          width: 18,
          height: 18,
          errorBuilder: (_, _, _) => const SizedBox.shrink(),
        ),
        const SizedBox(width: 6),
        Text.rich(
          TextSpan(
            children: [
              const TextSpan(text: 'nexa'),
              TextSpan(
                text: 'GO',
                style: TextStyle(color: light ? ink : AppColors.brand),
              ),
            ],
          ),
          style: AppTypography.soraRegular(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.36,
            height: 1,
            color: ink,
          ),
        ),
      ],
    );
  }
}

class _CrewRow extends StatelessWidget {
  const _CrewRow({
    required this.crew,
    required this.light,
    required this.ink,
    required this.sub,
  });

  final List<BookingStoryPerson> crew;
  final bool light;
  final Color ink;
  final Color sub;

  static const int _maxAvatars = 4;
  static const double _avatar = 30;
  static const double _step = 21;

  @override
  Widget build(BuildContext context) {
    final shown = crew.take(_maxAvatars).toList();
    return Container(
      padding: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: light
                ? const Color(0x2E140A03)
                : Colors.white.withValues(alpha: 0.16),
          ),
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: _avatar + _step * (shown.length - 1),
            height: _avatar,
            child: Stack(
              children: [
                for (var i = 0; i < shown.length; i++)
                  Positioned(
                    left: _step * i,
                    child: BookingStoryAvatar(
                      person: shown[i],
                      hue: BookingStoryAvatar
                          .hues[i % BookingStoryAvatar.hues.length],
                      borderColor: light
                          ? const Color(0xFFD8B686)
                          : const Color(0xFF0B0B0C),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: bookingStoryCrewNames(crew),
                    style: TextStyle(fontWeight: FontWeight.w700, color: ink),
                  ),
                  TextSpan(text: '\n${bookingStoryCrewCaption(crew.length)}'),
                ],
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                height: 1.3,
                color: sub,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Avatar redondo da arte: foto quando tem, senão iniciais num degradê.
class BookingStoryAvatar extends StatelessWidget {
  const BookingStoryAvatar({
    super.key,
    required this.person,
    required this.hue,
    required this.borderColor,
    this.size = 30,
  });

  /// Matizes dos avatares sem foto, na ordem do protótipo.
  static const List<double> hues = [25, 130, 280, 330];

  final BookingStoryPerson person;
  final double hue;
  final Color borderColor;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initials = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            HSLColor.fromAHSL(1, hue, 0.6, 0.45).toColor(),
            HSLColor.fromAHSL(1, (hue + 30) % 360, 0.6, 0.28).toColor(),
          ],
        ),
      ),
      child: Center(
        child: Text(
          person.initials,
          style: AppTypography.soraRegular(
            fontSize: size / 3,
            fontWeight: FontWeight.w700,
            height: 1,
            color: Colors.white,
          ),
        ),
      ),
    );
    final url = person.avatarUrl;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: borderColor, width: 2),
      ),
      child: ClipOval(
        child: url == null
            ? initials
            // Sem fade: a captura sai com o que estiver pintado no quadro.
            : Image(
                image: CachedNetworkImageProvider(url),
                fit: BoxFit.cover,
                frameBuilder: (_, child, frame, sync) =>
                    frame == null && !sync ? initials : child,
                errorBuilder: (_, _, _) => initials,
              ),
      ),
    );
  }
}
