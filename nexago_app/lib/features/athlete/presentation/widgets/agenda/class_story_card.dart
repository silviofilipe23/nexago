import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../../../core/deep_link/app_domains.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../arenas/domain/booking_story.dart';
import '../../../../arenas/presentation/widgets/booking_story/booking_story_card.dart';
import '../../../domain/agenda/class_story.dart';

/// A arte 9:16 do story do treino (Agenda · F4/F5) na base 360×640, sobre a
/// mesma moldura do story da reserva — fundo, marca, selo e rodapé iguais; só
/// muda o conteúdo.
class ClassStoryCard extends StatelessWidget {
  const ClassStoryCard({
    super.key,
    required this.data,
    required this.theme,
    required this.infos,
    this.photo,
    this.headline = 'Treino\npago.',
  });

  final ClassStoryData data;

  /// A frase grande (duas linhas) — ver [kClassStoryHeadlines].
  final String headline;
  final BookingStoryTheme theme;
  final Set<ClassStoryInfo> infos;
  final Uint8List? photo;

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = BookingStoryArtFrame.inkOf(theme);
    final sub = BookingStoryArtFrame.subOf(theme);
    final accent = light ? BookingStoryCard.lightInk : AppColors.brandHover;
    final rule =
        light ? const Color(0x2E140A03) : Colors.white.withValues(alpha: 0.16);
    final showPeople =
        infos.contains(ClassStoryInfo.people) && data.people.isNotEmpty;

    final blocks = <Widget>[
      Text(
        data.kicker,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.mono(
          fontSize: 10,
          letterSpacing: 1.6,
          color: accent,
        ),
      ),
      // Encolhe em vez de quebrar se uma frase nova passar da largura.
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          headline,
          style: AppTypography.soraRegular(
            fontSize: 54,
            fontWeight: FontWeight.w800,
            letterSpacing: -2.16,
            height: 0.92,
            color: ink,
          ),
        ),
      ),
      if (infos.contains(ClassStoryInfo.numbers) && data.stats.isNotEmpty)
        Row(
          children: [
            for (var i = 0; i < data.stats.length; i++) ...[
              if (i > 0) const SizedBox(width: 20),
              _Stat(
                  value: data.stats[i].$1,
                  label: data.stats[i].$2,
                  ink: ink,
                  sub: sub),
            ],
          ],
        ),
      if (infos.contains(ClassStoryInfo.place) && data.arenaName.isNotEmpty)
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
                      style: TextStyle(fontWeight: FontWeight.w700, color: ink),
                    ),
                    TextSpan(text: data.placeLine),
                  ],
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: sub,
                ),
              ),
            ),
          ],
        ),
      if (data.handle.isNotEmpty)
        Container(
          padding: const EdgeInsets.only(top: 11),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: rule)),
          ),
          child: Row(
            children: [
              if (showPeople) ...[
                _Avatars(people: data.people, light: light),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: data.handle,
                        style:
                            TextStyle(fontWeight: FontWeight.w700, color: ink),
                      ),
                      if ((showPeople ? data.withLine : data.noPeopleLine)
                          .isNotEmpty)
                        TextSpan(
                          text:
                              '\n${showPeople ? data.withLine : data.noPeopleLine}',
                        ),
                    ],
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                    color: sub,
                  ),
                ),
              ),
            ],
          ),
        ),
    ];

    return BookingStoryArtFrame(
      theme: theme,
      photo: photo,
      pillLabel: 'TREINO FEITO',
      pillColor: light ? BookingStoryCard.lightInk : AppColors.win,
      pillTextColor: light ? const Color(0xFFE9D3B0) : const Color(0xFF062514),
      footerLabel: 'TREINE TAMBÉM · ${AppDomains.siteHost.toUpperCase()}',
      blocksBottom: 124,
      blocks: blocks,
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.value,
    required this.label,
    required this.ink,
    required this.sub,
  });

  final String value;
  final String label;
  final Color ink;
  final Color sub;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          value,
          style: AppTypography.mono(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.48,
            color: ink,
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 9.5,
            letterSpacing: 1.14,
            color: sub,
          ),
        ),
      ],
    );
  }
}

class _Avatars extends StatelessWidget {
  const _Avatars({required this.people, required this.light});

  final List<BookingStoryPerson> people;
  final bool light;

  static const double _size = 28;
  static const double _step = 20;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: _size + _step * (people.length - 1),
      height: _size,
      child: Stack(
        children: [
          for (var i = 0; i < people.length; i++)
            Positioned(
              left: _step * i,
              child: BookingStoryAvatar(
                person: people[i],
                size: _size,
                hue:
                    BookingStoryAvatar.hues[i % BookingStoryAvatar.hues.length],
                borderColor:
                    light ? const Color(0xFFD8B686) : const Color(0xFF0B0B0C),
              ),
            ),
        ],
      ),
    );
  }
}
