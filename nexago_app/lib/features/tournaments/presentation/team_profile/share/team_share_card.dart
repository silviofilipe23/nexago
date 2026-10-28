import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/team_profile/team_share_card.dart';
import 'team_share_card_atoms.dart';

/// A arte 9:16 de compartilhar a equipe (canvas "Card Perfil da Equipe" e
/// "Card Perfil da Dupla"). Base 360×640, capturada em 3× = 1080×1920.
class TeamShareCard extends StatelessWidget {
  const TeamShareCard({super.key, required this.data, required this.style});

  static const Size size = TeamShareTokens.size;

  final TeamShareCardData data;
  final TeamShareCardStyle style;

  @override
  Widget build(BuildContext context) {
    final card = switch (style) {
      TeamShareCardStyle.profile =>
        data.isDuo ? _DuoSplitCard(data: data) : _TeamCrestCard(data: data),
      TeamShareCardStyle.roster =>
        data.isDuo ? _DuoSheetCard(data: data) : _TeamRosterCard(data: data),
      TeamShareCardStyle.ranking => _RankingCard(data: data),
    };
    return SizedBox.fromSize(
      size: size,
      child: ClipRect(
          child: Material(type: MaterialType.transparency, child: card)),
    );
  }
}

/// Nome da dupla com a barra laranja (ou apagada, no fundo laranja).
List<InlineSpan> _duoNameSpans(TeamShareCardData data, Color slash) {
  final names = data.members.take(2).map((m) => m.name).toList();
  return [
    for (var i = 0; i < names.length; i++) ...[
      if (i > 0) TextSpan(text: ' / ', style: TextStyle(color: slash)),
      TextSpan(text: names[i]),
    ],
  ];
}

TextStyle _originStyle(Color color) => AppTypography.mono(
      fontSize: 8.7,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.87,
      height: 1.2,
      color: color,
    );

/// Matiz e brilho atrás do conteúdo (`radial-gradient` do canvas).
class _Glow extends StatelessWidget {
  const _Glow({
    required this.center,
    required this.radius,
    required this.color,
  });

  final Offset center;
  final double radius;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: center.dx - radius,
      top: center.dy - radius,
      width: radius * 2,
      height: radius * 2,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0)],
            stops: const [0, 0.7],
          ),
        ),
      ),
    );
  }
}

/// Esmaece a base das fotos no fundo.
class _PhotoFade extends StatelessWidget {
  const _PhotoFade({required this.top, required this.height, this.stop = 0.88});

  final double top;
  final double height;
  final double stop;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      top: top,
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              TeamShareTokens.bg.withValues(alpha: 0),
              TeamShareTokens.bg,
            ],
            stops: [0, stop],
          ),
        ),
      ),
    );
  }
}

// ── Equipe · A · Escudo ────────────────────────────────────────────────────

class _TeamCrestCard extends StatelessWidget {
  const _TeamCrestCard({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    final origin = data.originLine;
    return ColoredBox(
      color: TeamShareTokens.bg,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _Glow(
            center: const Offset(180, 141),
            radius: 252,
            color: TeamShareTokens.hueColor(data.hue, 0.6, 0.4, 0.35),
          ),
          Padding(
            padding: const EdgeInsets.all(TeamShareTokens.pad),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TeamShareTopBar(
                  trailing: Text(
                    data.kicker,
                    textScaler: TextScaler.noScaling,
                    style: TeamShareTokens.label(8),
                  ),
                ),
                const SizedBox(height: 43),
                Center(child: TeamShareCrest(data: data, size: 100)),
                const SizedBox(height: 14.7),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 300),
                    child: TeamShareFitText(
                      spans: [TextSpan(text: data.name)],
                      style: TeamShareTokens.display(
                        41.3,
                        em: -0.045,
                        height: 0.94,
                      ),
                      sizes: const [41.3, 36.7, 33.3, 30, 26.7],
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                if (origin.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    origin,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textScaler: TextScaler.noScaling,
                    style: _originStyle(TeamShareTokens.mute)
                        .copyWith(fontSize: 9.3, letterSpacing: 0.93),
                  ),
                ],
                const SizedBox(height: 30),
                TeamShareStatStrip(
                  stats: [
                    TeamShareStat(label: 'RANKING', value: data.rankLabel),
                    TeamShareStat(
                      label: 'PONTOS',
                      value: teamShareThousands(data.points),
                    ),
                    TeamShareStat(label: 'TÍTULOS', value: '${data.titles}'),
                  ],
                ),
                const SizedBox(height: 18.7),
                Text(
                  'ELENCO · ${data.members.length} ATLETAS',
                  textScaler: TextScaler.noScaling,
                  style: TeamShareTokens.label(7.3),
                ),
                const SizedBox(height: 8.7),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TeamShareRosterRow(data: data, size: 41.3),
                ),
                const Spacer(),
                TeamShareFooter(data: data),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Equipe · B · Elenco ────────────────────────────────────────────────────

class _TeamRosterCard extends StatelessWidget {
  const _TeamRosterCard({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: TeamShareTokens.bg,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 393,
            child: _Mosaic(data: data),
          ),
          const _PhotoFade(top: 187, height: 213),
          Positioned(
            left: TeamShareTokens.pad,
            right: TeamShareTokens.pad,
            top: 24,
            child: TeamShareTopBar(
              trailing: TeamSharePill(
                label: '${data.members.length} ATLETAS',
              ),
            ),
          ),
          Positioned(
            left: TeamShareTokens.pad,
            right: TeamShareTokens.pad,
            top: 333,
            bottom: TeamShareTokens.pad,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    TeamShareCrest(data: data, size: 50),
                    const SizedBox(width: 11.3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TeamShareFitText(
                            spans: [TextSpan(text: data.name)],
                            style: TeamShareTokens.display(30.7, height: 0.95),
                            sizes: const [30.7, 27.3, 25.3, 22.7],
                          ),
                          if (data.location.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              data.location.toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textScaler: TextScaler.noScaling,
                              style: _originStyle(TeamShareTokens.mute),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18.7),
                TeamShareStatBlocks(data: data),
                const Spacer(),
                TeamShareFooter(data: data),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Fotos do elenco em grade: três colunas a partir de sete atletas, duas
/// abaixo disso. A última linha incompleta estica para não sobrar buraco.
class _Mosaic extends StatelessWidget {
  const _Mosaic({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    final members = data.members;
    if (members.isEmpty)
      return const ColoredBox(color: TeamShareTokens.surface);
    final cols = members.length > 6 ? 3 : 2;
    final rows = <List<int>>[
      for (var i = 0; i < members.length; i += cols)
        [for (var j = i; j < i + cols && j < members.length; j++) j],
    ];
    return Column(
      children: [
        for (var r = 0; r < rows.length; r++) ...[
          if (r > 0) const SizedBox(height: 2),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var c = 0; c < rows[r].length; c++) ...[
                  if (c > 0) const SizedBox(width: 2),
                  Expanded(
                    child: TeamSharePhotoTile(
                      member: members[rows[r][c]],
                      hue: teamShareMemberHue(data.hue, rows[r][c]),
                      initialsSize: cols == 3 || rows.length > 2 ? 30 : 40,
                      // A última linha fica atrás do nome: as iniciais sobem.
                      initialsAlignment: r > 0 && r == rows.length - 1
                          ? const Alignment(0, -0.4)
                          : Alignment.center,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ── Dupla · A · Lado a lado ────────────────────────────────────────────────

class _DuoSplitCard extends StatelessWidget {
  const _DuoSplitCard({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    final pair = data.members.take(2).toList();
    final origin = data.originLine;
    return ColoredBox(
      color: TeamShareTokens.bg,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 373,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < pair.length; i++) ...[
                  if (i > 0) const SizedBox(width: 2),
                  Expanded(
                    child: TeamSharePhotoTile(
                      member: pair[i],
                      hue: teamShareMemberHue(data.hue, i),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const _PhotoFade(top: 173, height: 207, stop: 0.86),
          Positioned(
            left: TeamShareTokens.pad,
            right: TeamShareTokens.pad,
            top: 24,
            child: TeamShareTopBar(
              trailing: data.sportLabel.isEmpty
                  ? const SizedBox.shrink()
                  : TeamSharePill(label: data.sportLabel.toUpperCase()),
            ),
          ),
          Positioned(
            left: TeamShareTokens.pad,
            right: TeamShareTokens.pad,
            top: 300,
            bottom: TeamShareTokens.pad,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  data.kicker,
                  textScaler: TextScaler.noScaling,
                  style: TeamShareTokens.label(8.7, color: AppColors.brand),
                ),
                const SizedBox(height: 6),
                TeamShareFitText(
                  spans: _duoNameSpans(data, AppColors.brand),
                  style: TeamShareTokens.display(40, em: -0.045, height: 0.92),
                  sizes: const [40, 36, 32, 28.7, 25.3],
                ),
                if (origin.isNotEmpty) ...[
                  const SizedBox(height: 7.3),
                  Text(
                    origin,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textScaler: TextScaler.noScaling,
                    style: _originStyle(TeamShareTokens.mute),
                  ),
                ],
                const SizedBox(height: 18.7),
                TeamShareStatBlocks(data: data),
                const Spacer(),
                TeamShareFooter(data: data),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Dupla · B · Ficha ──────────────────────────────────────────────────────

class _DuoSheetCard extends StatelessWidget {
  const _DuoSheetCard({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    final pair = data.members.take(2).toList();
    final origin = data.originLine;
    return ColoredBox(
      color: TeamShareTokens.bg,
      child: Stack(
        fit: StackFit.expand,
        children: [
          for (var i = 0; i < pair.length; i++)
            _Glow(
              center: Offset(i == 0 ? 90 : 270, 141),
              radius: 190,
              color: TeamShareTokens.hueColor(
                teamShareMemberHue(data.hue, i),
                0.6,
                0.4,
                0.28,
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(TeamShareTokens.pad),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TeamShareTopBar(
                  trailing: Text(
                    data.kicker,
                    textScaler: TextScaler.noScaling,
                    style: TeamShareTokens.label(8),
                  ),
                ),
                const SizedBox(height: 40),
                Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.topCenter,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var i = 0; i < pair.length; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          Expanded(
                            child: _SheetPlayer(
                              member: pair[i],
                              hue: teamShareMemberHue(data.hue, i),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (pair.length == 2)
                      Positioned(
                        top: 43.3 - 14,
                        child: Container(
                          width: 28,
                          height: 28,
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                            color: AppColors.brand,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '+',
                            textScaler: TextScaler.noScaling,
                            style: TeamShareTokens.display(
                              13.3,
                              color: TeamShareTokens.ink,
                              em: 0,
                              height: 1,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                if (origin.isNotEmpty) ...[
                  const SizedBox(height: 23.3),
                  Text(
                    origin,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textScaler: TextScaler.noScaling,
                    style: _originStyle(TeamShareTokens.mute),
                  ),
                ],
                const SizedBox(height: 20),
                TeamShareStatStrip(
                  stats: [
                    TeamShareStat(
                      label: 'RANKING',
                      value: data.rankLabel,
                      size: 24,
                    ),
                    TeamShareStat(
                      label: 'JOGOS',
                      value: '${data.games}',
                      size: 24,
                    ),
                    TeamShareStat(
                      label: 'VITÓRIAS',
                      value: '${data.wins}',
                      size: 24,
                    ),
                    TeamShareStat(
                      label: 'TÍTULOS',
                      value: '${data.titles}',
                      size: 24,
                    ),
                  ],
                ),
                if (data.form.isNotEmpty) ...[
                  const SizedBox(height: 16.7),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          data.form.length == 1
                              ? 'ÚLTIMO JOGO'
                              : 'ÚLTIMOS ${data.form.length} JOGOS',
                          textScaler: TextScaler.noScaling,
                          style: TeamShareTokens.label(7.3),
                        ),
                      ),
                      TeamShareForm(form: data.form),
                    ],
                  ),
                ],
                const Spacer(),
                TeamShareFooter(data: data),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetPlayer extends StatelessWidget {
  const _SheetPlayer({required this.member, required this.hue});

  final TeamShareMember member;
  final double hue;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TeamShareAvatar(
          member: member,
          hue: hue,
          size: 86.7,
          ring: TeamShareTokens.lineStrong,
        ),
        const SizedBox(height: 8.7),
        Text(
          member.name,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textScaler: TextScaler.noScaling,
          style: TeamShareTokens.display(17.3, em: -0.035, height: 1),
        ),
        if (member.detail.isNotEmpty) ...[
          const SizedBox(height: 3.3),
          Text(
            member.detail,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textScaler: TextScaler.noScaling,
            style: TeamShareTokens.label(7.3),
          ),
        ],
      ],
    );
  }
}

// ── C · Ranking (equipe e dupla) ───────────────────────────────────────────

class _RankingCard extends StatelessWidget {
  const _RankingCard({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    final subline = [data.location, data.sportLabel]
        .where((s) => s.isNotEmpty)
        .join(' · ')
        .toUpperCase();
    return Stack(
      fit: StackFit.expand,
      children: [
        TeamShareOrangeBackdrop(ghost: data.rankLabel),
        Padding(
          padding: const EdgeInsets.all(TeamShareTokens.pad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TeamShareTopBar(
                onOrange: true,
                trailing: data.isDuo
                    ? _DuoFaces(data: data)
                    : TeamShareCrest(data: data, size: 40, onOrange: true),
              ),
              const SizedBox(height: 36.7),
              Text(
                data.rankingLabel,
                maxLines: 1,
                textScaler: TextScaler.noScaling,
                style: TeamShareTokens.label(
                  9.3,
                  color: TeamShareTokens.inkMute,
                  em: 0.16,
                ),
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  data.rankLabel,
                  maxLines: 1,
                  textScaler: TextScaler.noScaling,
                  style: TeamShareTokens.display(
                    106.7,
                    color: TeamShareTokens.ink,
                    em: -0.06,
                    height: 0.82,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 296),
                child: TeamShareFitText(
                  spans: data.isDuo
                      ? _duoNameSpans(data, TeamShareTokens.inkSoft)
                      : [TextSpan(text: data.name)],
                  style: TeamShareTokens.display(
                    data.isDuo ? 36 : 37.3,
                    color: TeamShareTokens.ink,
                    em: -0.045,
                    height: 0.92,
                  ),
                  sizes: const [37.3, 33.3, 30.7, 27.3, 24],
                ),
              ),
              if (subline.isNotEmpty) ...[
                const SizedBox(height: 6.7),
                Text(
                  subline,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textScaler: TextScaler.noScaling,
                  style: TeamShareTokens.label(
                    8.7,
                    color: TeamShareTokens.inkMute,
                    em: 0.1,
                  ),
                ),
              ],
              const Spacer(),
              TeamShareDarkPanel(
                data: data,
                footerLeading: data.isDuo
                    ? TeamShareForm(form: data.form, size: 16)
                    : TeamShareRosterRow(
                        data: data,
                        size: 26.7,
                        ring: TeamShareTokens.ink,
                        max: 6,
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Os dois rostos da dupla no canto do card laranja.
class _DuoFaces extends StatelessWidget {
  const _DuoFaces({required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    return TeamShareRosterRow(
      data: data,
      size: 36.7,
      ring: TeamShareTokens.ink,
      max: 2,
    );
  }
}
