import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../../core/deep_link/app_domains.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arenas/domain/booking_story.dart';
import '../../../arenas/presentation/widgets/booking_story/booking_story_card.dart';
import '../../domain/ranking_display_helpers.dart';
import '../../domain/ranking_story.dart';

/// A arte 9:16 do story do ranking (canvas "Card de Ranking", direção A ·
/// Posição): o número é o herói. Base 360×640 sobre a mesma moldura dos
/// outros stories — fundo (tema ou foto), marca, selo e rodapé iguais.
class RankingStoryCard extends StatelessWidget {
  const RankingStoryCard({
    super.key,
    required this.data,
    required this.theme,
    required this.infos,
    this.photo,
  });

  final RankingStoryData data;
  final BookingStoryTheme theme;
  final Set<RankingStoryInfo> infos;
  final Uint8List? photo;

  /// Do fim da linha da marca (92 + selo + respiro) até o bloco (120 da base).
  static const double maxBlocksHeight = 640 - 92 - 40 - 120;

  static const List<Shadow> _photoShadows = [
    Shadow(color: Color(0xA6000000), blurRadius: 16),
  ];

  /// Ouro, prata e bronze (as do story da campanha); fora do pódio, a marca.
  static Color medalOf(RankingStoryTier tier) => switch (tier) {
        RankingStoryTier.gold => AppColors.pending,
        RankingStoryTier.silver => const Color(0xFFD9DCE1),
        RankingStoryTier.bronze => const Color(0xFFD08A4E),
        _ => AppColors.brand,
      };

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = BookingStoryArtFrame.inkOf(theme);
    final sub = BookingStoryArtFrame.subOf(theme);
    final tier = data.tier;
    final medal = medalOf(tier);
    // No fundo areia a medalha some: o destaque vira a tinta escura.
    final accent = light
        ? BookingStoryCard.lightInk
        : tier.isPodium
            ? medal
            : AppColors.brandHover;
    final medalLabel = data.medalLabel;
    final showField = infos.contains(RankingStoryInfo.field);
    final showIdentity = infos.contains(RankingStoryInfo.identity);
    final showPoints = infos.contains(RankingStoryInfo.points);
    // Sobre a foto o bloco começa acima do escurecimento da base: sombra para
    // o texto ler num céu claro.
    final shadows = theme == BookingStoryTheme.photo ? _photoShadows : null;

    final blocks = <Widget>[
      Text(
        data.kicker,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.mono(
          fontSize: 10,
          letterSpacing: 2,
          // A cor da medalha some num céu de pôr do sol; branco lê em qualquer
          // foto.
          color: shadows == null ? accent : ink,
        ).copyWith(shadows: shadows),
      ),
      _Position(
        rank: data.rank,
        ink: ink,
        ordinal: light ? ink.withValues(alpha: 0.45) : medal,
        shadows: shadows,
      ),
      Text(
        data.cutLine,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: AppTypography.mono(
          fontSize: 9,
          letterSpacing: 1.3,
          height: 1.4,
          color: sub,
        ).copyWith(shadows: shadows),
      ),
      if (medalLabel != null || showField)
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: [
            if (medalLabel != null)
              _MedalTag(label: medalLabel, medal: medal, light: light),
            if (showField) _FieldTag(label: data.fieldLabel, ink: ink),
          ],
        ),
      if (showIdentity || showPoints)
        _IdentityCard(
          data: data,
          light: light,
          ink: ink,
          sub: sub,
          accent: accent,
          showIdentity: showIdentity,
          showPoints: showPoints,
        ),
    ];

    return BookingStoryArtFrame(
      theme: theme,
      photo: photo,
      deepScrim: true,
      pillLabel: data.pillLabel,
      pillColor: light ? BookingStoryCard.lightInk : medal,
      pillTextColor: light ? const Color(0xFFE9D3B0) : const Color(0xFF0A0A0A),
      footerLabel: 'RANKING VIA ${AppDomains.siteHost.toUpperCase()}',
      blocksBottom: 120,
      // Um bloco só, com teto: com o número gigante e um recorte comprido o
      // conteúdo subiria por cima da marca. Passou do teto, encolhe.
      blocks: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: maxBlocksHeight),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.bottomCenter,
            child: SizedBox(
              width: BookingStoryCard.size.width - 48,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var i = 0; i < blocks.length; i++) ...[
                    if (i > 0) SizedBox(height: i == 1 ? 10 : 14),
                    blocks[i],
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// "4º": o número em Sora 200 e o ordinal na cor da medalha, no alto.
class _Position extends StatelessWidget {
  const _Position({
    required this.rank,
    required this.ink,
    required this.ordinal,
    this.shadows,
  });

  final int rank;
  final Color ink;
  final Color ordinal;
  final List<Shadow>? shadows;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      // Três dígitos encolhem em vez de estourar a largura.
      constraints: const BoxConstraints(maxWidth: 280),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$rank',
              style: AppTypography.soraRegular(
                fontSize: 200,
                fontWeight: FontWeight.w800,
                letterSpacing: -14,
                height: 0.86,
                color: ink,
              ).copyWith(shadows: shadows),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 6, top: 8),
              child: Text(
                'º',
                style: AppTypography.soraRegular(
                  fontSize: 64,
                  fontWeight: FontWeight.w800,
                  height: 1,
                  color: ordinal,
                ).copyWith(shadows: shadows),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MedalTag extends StatelessWidget {
  const _MedalTag({
    required this.label,
    required this.medal,
    required this.light,
  });

  final String label;
  final Color medal;
  final bool light;

  @override
  Widget build(BuildContext context) {
    final fg = light ? const Color(0xFFE9D3B0) : const Color(0xFF0A0A0A);
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: light ? BookingStoryCard.lightInk : medal,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: light ? medal : fg,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 8.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.3,
              height: 1,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldTag extends StatelessWidget {
  const _FieldTag({required this.label, required this.ink});

  final String label;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    // Row e não `alignment`: no Wrap, Container alinhado estica a linha toda.
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: ink.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: ink.withValues(alpha: 0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 8.5,
              letterSpacing: 1.1,
              height: 1,
              color: ink.withValues(alpha: 0.86),
            ),
          ),
        ],
      ),
    );
  }
}

/// O cartão de baixo: rostos + nome à esquerda, pontos à direita. Sem o nome,
/// sobram os pontos; sem os pontos, o nome ocupa a linha.
class _IdentityCard extends StatelessWidget {
  const _IdentityCard({
    required this.data,
    required this.light,
    required this.ink,
    required this.sub,
    required this.accent,
    required this.showIdentity,
    required this.showPoints,
  });

  final RankingStoryData data;
  final bool light;
  final Color ink;
  final Color sub;
  final Color accent;
  final bool showIdentity;
  final bool showPoints;

  @override
  Widget build(BuildContext context) {
    final points = Column(
      crossAxisAlignment:
          showIdentity ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          formatRankingPoints(data.points),
          style: AppTypography.mono(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.96,
            height: 1,
            color: accent,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'PONTOS',
          style: AppTypography.mono(
            fontSize: 7.5,
            letterSpacing: 1.3,
            height: 1,
            color: sub,
          ),
        ),
      ],
    );

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: light
            ? BookingStoryCard.lightInk.withValues(alpha: 0.07)
            : const Color(0xC70B0B0C),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: light
              ? const Color(0x24140A03)
              : Colors.white.withValues(alpha: 0.10),
        ),
      ),
      child: Row(
        children: [
          if (showIdentity) ...[
            _Faces(people: data.people, light: light),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    data.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.4,
                      height: 1.15,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    data.identityLine,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w500,
                      height: 1.2,
                      color: sub,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (showPoints) ...[
            if (showIdentity) const SizedBox(width: 10),
            points,
          ],
        ],
      ),
    );
  }
}

class _Faces extends StatelessWidget {
  const _Faces({required this.people, required this.light});

  final List<BookingStoryPerson> people;
  final bool light;

  static const double _size = 34;
  static const double _step = 24;

  @override
  Widget build(BuildContext context) {
    final shown = people.take(2).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      width: _size + _step * (shown.length - 1),
      height: _size,
      child: Stack(
        children: [
          for (var i = 0; i < shown.length; i++)
            Positioned(
              left: _step * i,
              child: BookingStoryAvatar(
                person: shown[i],
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
