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

  static const Color _darkInk = Color(0xFFF4F4F5);
  static const Color _lightInk = Color(0xFF140A03);

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = light ? _lightInk : _darkInk;
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
            color: light ? _lightInk : AppColors.brandHover,
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

    // Material próprio: a arte não herda (nem depende de) quem a hospeda.
    return Material(
      type: MaterialType.transparency,
      child: SizedBox.fromSize(
        size: size,
        child: ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              BookingStoryBackground(theme: theme, photo: photo),
              Positioned(
                top: 92,
                left: 24,
                right: 24,
                child: Row(
                  children: [
                    _Wordmark(light: light, ink: ink),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: light ? _lightInk : AppColors.win,
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        'QUADRA GARANTIDA',
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.08,
                          height: 1,
                          color: light
                              ? const Color(0xFFE9D3B0)
                              : const Color(0xFF062514),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 24,
                right: 24,
                bottom: 124,
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
                          'RESERVE TAMBÉM · ${AppDomains.siteHost.toUpperCase()}',
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
  const BookingStoryBackground({super.key, required this.theme, this.photo});

  final BookingStoryTheme theme;
  final Uint8List? photo;

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
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x8C050505),
                    Color(0x00050505),
                    Color(0x00050505),
                    Color(0xEB050505),
                  ],
                  stops: [0, 0.22, 0.42, 0.82],
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
class _Wordmark extends StatelessWidget {
  const _Wordmark({required this.light, required this.ink});

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

  /// Matizes dos avatares sem foto, na ordem do protótipo.
  static const List<double> _hues = [25, 130, 280, 330];
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
                    child: _Avatar(
                      person: shown[i],
                      hue: _hues[i % _hues.length],
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

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.person,
    required this.hue,
    required this.borderColor,
  });

  final BookingStoryPerson person;
  final double hue;
  final Color borderColor;

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
            fontSize: 10,
            fontWeight: FontWeight.w700,
            height: 1,
            color: Colors.white,
          ),
        ),
      ),
    );
    final url = person.avatarUrl;
    return Container(
      width: _CrewRow._avatar,
      height: _CrewRow._avatar,
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
