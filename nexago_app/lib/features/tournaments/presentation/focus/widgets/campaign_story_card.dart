import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../../../core/deep_link/app_domains.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../arenas/domain/booking_story.dart';
import '../../../../arenas/presentation/widgets/booking_story/booking_story_card.dart';
import '../../../domain/focus/campaign_share_data.dart';
import '../../../domain/focus/campaign_story.dart';

/// A arte 9:16 do story da campanha no torneio, na base 360×640, sobre a
/// mesma moldura do story da reserva e do treino — fundo (tema ou foto),
/// marca, selo e rodapé iguais; só muda o conteúdo.
class CampaignStoryCard extends StatelessWidget {
  const CampaignStoryCard({
    super.key,
    required this.data,
    required this.theme,
    required this.infos,
    this.photo,
  });

  final CampaignStoryData data;
  final BookingStoryTheme theme;
  final Set<CampaignStoryInfo> infos;
  final Uint8List? photo;

  /// Do fim da linha da marca (92 + selo + respiro) até o bloco (120 da base).
  static const double maxBlocksHeight = 640 - 92 - 40 - 120;

  /// Selo do pódio: ouro, prata e bronze; campanha sem pódio fica na marca.
  static Color pillColorOf(CampaignPlacement placement) => switch (placement) {
        CampaignPlacement.champion => AppColors.pending,
        CampaignPlacement.runnerUp => const Color(0xFFD9DCE1),
        CampaignPlacement.third => const Color(0xFFD08A4E),
        CampaignPlacement.none => AppColors.brand,
      };

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = BookingStoryArtFrame.inkOf(theme);
    final sub = BookingStoryArtFrame.subOf(theme);
    final accent = light ? BookingStoryCard.lightInk : AppColors.brandHover;
    final rule =
        light ? const Color(0x2E140A03) : Colors.white.withValues(alpha: 0.16);
    final c = data.campaign;
    final kicker = data.kicker;
    final rows = campaignStoryRows(c.rows);

    final blocks = <Widget>[
      if (kicker.isNotEmpty)
        Text(
          kicker,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.mono(
            fontSize: 10,
            letterSpacing: 1.6,
            color: accent,
          ),
        ),
      // Encolhe em vez de quebrar quando a frase passa da largura.
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          data.headline,
          style: AppTypography.soraRegular(
            fontSize: 48,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.92,
            height: 0.92,
            color: ink,
          ),
        ),
      ),
      // Cartel de dois dígitos ("12 VITÓRIAS") encolhe em vez de estourar.
      if (infos.contains(CampaignStoryInfo.record))
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Stat(
                value: '${c.wins}',
                label: c.wins == 1 ? 'VITÓRIA' : 'VITÓRIAS',
                ink: ink,
                sub: sub,
              ),
              const SizedBox(width: 18),
              _Stat(
                value: '${c.losses}',
                label: c.losses == 1 ? 'DERROTA' : 'DERROTAS',
                ink: ink,
                sub: sub,
              ),
              const SizedBox(width: 18),
              _Stat(
                value: '${c.setsWon}–${c.setsLost}',
                label: 'SETS',
                ink: ink,
                sub: sub,
              ),
            ],
          ),
        ),
      if (infos.contains(CampaignStoryInfo.path) && rows.isNotEmpty)
        Container(
          padding: const EdgeInsets.only(top: 10),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: rule)),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++)
                Padding(
                  padding: EdgeInsets.only(top: i == 0 ? 0 : 6),
                  child: _PathRow(
                    row: rows[i],
                    light: light,
                    ink: ink,
                    sub: sub,
                  ),
                ),
            ],
          ),
        ),
      if (infos.contains(CampaignStoryInfo.team) && c.teamName.isNotEmpty)
        Container(
          padding: const EdgeInsets.only(top: 11),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: rule)),
          ),
          child: Row(
            children: [
              if (data.people.isNotEmpty) ...[
                _Avatars(people: data.people, light: light),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Text(
                  c.teamName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                    color: ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      if (infos.contains(CampaignStoryInfo.event) &&
          c.tournamentName.isNotEmpty)
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(Icons.emoji_events_outlined, size: 14, color: sub),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: c.tournamentName,
                      style: TextStyle(fontWeight: FontWeight.w700, color: ink),
                    ),
                    if (data.eventLine.isNotEmpty)
                      TextSpan(text: '\n${data.eventLine}'),
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
    ];

    return BookingStoryArtFrame(
      theme: theme,
      photo: photo,
      deepScrim: true,
      pillLabel: data.pillLabel,
      pillColor:
          light ? BookingStoryCard.lightInk : pillColorOf(data.placement),
      pillTextColor: light ? const Color(0xFFE9D3B0) : const Color(0xFF0A0A0A),
      footerLabel: 'CAMPANHA VIA ${AppDomains.siteHost.toUpperCase()}',
      blocksBottom: 120,
      // Um bloco só, com teto: o conteúdo cresce para cima e, numa campanha
      // de nomes longos, subiria por cima da marca. Passou do teto, encolhe.
      blocks: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: maxBlocksHeight),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.bottomLeft,
            child: SizedBox(
              width: BookingStoryCard.size.width - 48,
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
          ),
        ),
      ],
    );
  }
}

/// Uma linha da trajetória: selo V/D, fase, adversário e o placar em sets.
class _PathRow extends StatelessWidget {
  const _PathRow({
    required this.row,
    required this.light,
    required this.ink,
    required this.sub,
  });

  final CampaignRow row;
  final bool light;
  final Color ink;
  final Color sub;

  @override
  Widget build(BuildContext context) {
    final mono = AppTypography.mono(
      fontSize: 9.5,
      letterSpacing: 0.95,
      color: sub,
    );
    final name = AppTypography.soraRegular(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      color: ink,
    );
    return switch (row) {
      CampaignMatchRow(
        :final won,
        :final phaseLabel,
        :final opponentName,
        :final setScore,
      ) =>
        Row(
          children: [
            _Badge(won: won, light: light),
            const SizedBox(width: 8),
            SizedBox(
              width: 64,
              child: Text(
                campaignStoryPhaseLabel(phaseLabel).toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: mono,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'vs $opponentName',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: name,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              setScore,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: ink,
              ),
            ),
          ],
        ),
      CampaignGroupRow(:final wins, :final losses, :final games) => Row(
          children: [
            _Badge(won: wins >= losses, light: light, label: 'G'),
            const SizedBox(width: 8),
            SizedBox(
              width: 64,
              child: Text('GRUPOS', style: mono),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                '${wins}V ${losses}D · $games ${games == 1 ? 'jogo' : 'jogos'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: name,
              ),
            ),
          ],
        ),
    };
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.won, required this.light, this.label});

  final bool won;
  final bool light;

  /// Sobrescreve o "V"/"D" (o resumo do grupo mostra "G").
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color = won
        ? (light ? AppColors.winLight : AppColors.win)
        : (light ? AppColors.liveLight : AppColors.live);
    return Container(
      width: 18,
      height: 18,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: light ? 0.16 : 0.22),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        label ?? (won ? 'V' : 'D'),
        style: AppTypography.mono(
          fontSize: 9.5,
          fontWeight: FontWeight.w800,
          height: 1,
          color: color,
        ),
      ),
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

  static const double _size = 30;
  static const double _step = 21;

  @override
  Widget build(BuildContext context) {
    final shown = people.take(4).toList();
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
