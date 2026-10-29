import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../tournaments/presentation/team_profile/share/team_share_card_atoms.dart';
import '../../domain/ranking_list_models.dart';
import '../../domain/ranking_share.dart';

/// A arte do ranking compartilhado (canvas "Ranking - Compartilhar", telas 3
/// e 5–8): o recorte impresso, o pódio, as linhas até o Top e o link com QR.
/// Base 360 de largura — 640 no story, 450 no post — capturada em 3×
/// (1080×1920 / 1080×1350). Fundo fixo escuro: é a lista que importa.
class RankingShareCard extends StatelessWidget {
  const RankingShareCard({
    super.key,
    required this.data,
    this.format = RankingShareFormat.story,
  });

  final RankingShareData data;

  /// [RankingShareFormat.link] não tem arte; cai no story.
  final RankingShareFormat format;

  static Size sizeOf(RankingShareFormat format) =>
      format == RankingShareFormat.post
          ? const Size(360, 450)
          : const Size(360, 640);

  @override
  Widget build(BuildContext context) {
    final post = format == RankingShareFormat.post;
    final m = post ? _Metrics.post : _Metrics.story;
    final hasList = data.rows.isNotEmpty || data.mineOutside;

    return MediaQuery.withNoTextScaling(
      child: Material(
        type: MaterialType.transparency,
        child: SizedBox.fromSize(
          size: sizeOf(format),
          child: ColoredBox(
            color: TeamShareTokens.bg,
            child: Stack(
              fit: StackFit.expand,
              children: [
                CustomPaint(
                  painter: TeamShareStripesPainter(
                    color: Colors.white.withValues(alpha: 0.04),
                    gap: 34,
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(27, m.top, 27, m.bottom),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const TeamShareWordmark(),
                          const Spacer(),
                          Text(
                            data.updatedLabel,
                            style: _mono(8, _Palette.mute, em: 0.18),
                          ),
                        ],
                      ),
                      SizedBox(height: m.kickerGap),
                      Text(
                        '● ${data.kicker}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: _mono(8, AppColors.brand, em: 0.2),
                      ),
                      const SizedBox(height: 7),
                      _TitleLine(
                        data.title,
                        size: m.title,
                        color: TeamShareTokens.text,
                      ),
                      _TitleLine(
                        data.subtitle,
                        size: m.title,
                        color: AppColors.brand,
                      ),
                      SizedBox(height: m.tagsGap),
                      Wrap(
                        spacing: 4.5,
                        runSpacing: 4.5,
                        children: [for (final t in data.tags) _Tag(t)],
                      ),
                      SizedBox(height: m.podiumGap),
                      if (data.podium.isNotEmpty)
                        _Podium(data: data, metrics: m),
                      if (hasList) ...[
                        const SizedBox(height: 10),
                        Expanded(
                          child: Align(
                            alignment: Alignment.topCenter,
                            child: _RowsPanel(data: data),
                          ),
                        ),
                      ] else
                        const Spacer(),
                      SizedBox(height: m.footerGap),
                      _Footer(data: data, qrSize: m.qr),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Medidas do canvas (405 de largura) já na base 360 — story e post.
class _Metrics {
  const _Metrics({
    required this.top,
    required this.bottom,
    required this.kickerGap,
    required this.title,
    required this.tagsGap,
    required this.podiumGap,
    required this.footerGap,
    required this.winnerFace,
    required this.face,
    required this.qr,
  });

  final double top;
  final double bottom;
  final double kickerGap;
  final double title;
  final double tagsGap;
  final double podiumGap;
  final double footerGap;

  /// Rosto do 1º e dos outros dois no pódio (dupla; trio+ encolhe).
  final double winnerFace;
  final double face;

  /// Lado do QR do rodapé.
  final double qr;

  static const story = _Metrics(
    top: 44,
    bottom: 34,
    kickerGap: 18,
    title: 32,
    tagsGap: 10,
    podiumGap: 16,
    footerGap: 10,
    winnerFace: 34,
    face: 27,
    qr: 48,
  );

  static const post = _Metrics(
    top: 24,
    bottom: 20,
    kickerGap: 12,
    title: 22,
    tagsGap: 8,
    podiumGap: 12,
    footerGap: 8,
    winnerFace: 25,
    face: 21,
    qr: 44,
  );
}

abstract final class _Palette {
  static const card = Color(0xFF0B0B0C);
  static const mute = Color(0xFF8D8D93);
  static const soft = Color(0xFFC4C4C8);
  static const points = Color(0xFFB4B4BA);
  static const rank = Color(0xFF6D6D73);
  static const orangeSoft = Color(0xFFFF8A4A);
  static const line = Color(0x14FFFFFF);
  static const divider = Color(0x0DFFFFFF);
}

TextStyle _mono(double size, Color color, {double em = 0.1}) =>
    AppTypography.mono(
      fontSize: size,
      fontWeight: FontWeight.w700,
      letterSpacing: size * em,
      height: 1.2,
      color: color,
    );

TextStyle _sora(double size, Color color, {FontWeight w = FontWeight.w700}) =>
    AppTypography.soraRegular(
      fontSize: size,
      fontWeight: w,
      height: 1.2,
      color: color,
    );

/// Uma linha do título: encolhe até caber, nunca quebra.
class _TitleLine extends StatelessWidget {
  const _TitleLine(this.text, {required this.size, required this.color});

  final String text;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: Text(
        text,
        maxLines: 1,
        style: TeamShareTokens.display(size, color: color, em: -0.035),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3.5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0x24FFFFFF)),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 8.5,
          fontWeight: FontWeight.w600,
          height: 1.1,
          color: _Palette.soft,
        ),
      ),
    );
  }
}

/// Quantos rostos a linha tem: o atleta, a dupla, o trio… (5+ vira escudo).
int _sizeOf(RankingListEntry entry, bool isTeam) {
  if (!isTeam) return 1;
  return switch (entry.teamFormat) {
    RankingFormatFilter.dupla => 2,
    RankingFormatFilter.trio => 3,
    RankingFormatFilter.quarteto => 4,
    RankingFormatFilter.quinteto => math.max(5, entry.members.length),
    _ => entry.members.length.clamp(2, 5),
  };
}

/// Os rostos na ordem do elenco; sem elenco resolvido, os dois da lista.
List<RankingEntryMember> _faces(RankingListEntry entry) {
  if (entry.members.isNotEmpty) return entry.members;
  if (entry.isTeam) {
    return [
      RankingEntryMember(
        initials: entry.player1Initials ?? '',
        avatarUrl: entry.player1AvatarUrl,
      ),
      RankingEntryMember(
        initials: entry.player2Initials ?? '',
        avatarUrl: entry.player2AvatarUrl,
      ),
    ];
  }
  return [
    RankingEntryMember(
      initials: entry.initials ?? '',
      avatarUrl: entry.avatarUrl,
    ),
  ];
}

/// O nome da linha pela regra do canvas: trio pelos apelidos ("A · B · C"),
/// o resto como na lista (atleta, "A / B", nome da equipe).
String _nameOf(RankingListEntry entry, int size) {
  if (size == 3) {
    final nicks = entry.members
        .map((m) => m.shortName.trim())
        .where((n) => n.isNotEmpty)
        .toList();
    if (nicks.length >= 2) return nicks.join(' · ');
  }
  return entry.displayName;
}

/// A linha de apoio: os integrantes no quarteto, "12 atletas" do quinteto
/// pra cima.
String? _supportOf(RankingListEntry entry, int size) {
  if (size == 4) {
    final nicks =
        entry.members.map((m) => m.shortName.trim()).where((n) => n.isNotEmpty);
    return nicks.isEmpty ? null : nicks.join(' · ');
  }
  if (size >= 5 && entry.members.isNotEmpty) {
    return '${entry.members.length} atletas';
  }
  return null;
}

/// Monograma do escudo (a equipe não tem logo): as iniciais do nome.
String _monogram(String name) {
  final words = name
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty && w[0].toUpperCase() != w[0].toLowerCase())
      .toList();
  if (words.isEmpty) return '?';
  if (words.length == 1) {
    final w = words.first;
    return w.substring(0, math.min(2, w.length)).toUpperCase();
  }
  return '${words[0][0]}${words[1][0]}'.toUpperCase();
}

/// Rosto redondo: foto ou iniciais, com o aro da cor do fundo.
class _Face extends StatelessWidget {
  const _Face({required this.member, required this.size});

  final RankingEntryMember member;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initials = DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A2A2E), Color(0xFF17171A)],
        ),
      ),
      child: Center(
        child: Text(
          member.initials,
          style: TeamShareTokens.display(
            size * 0.36,
            color: const Color(0xE6F4F4F5),
            em: -0.02,
            height: 1,
            weight: FontWeight.w700,
          ),
        ),
      ),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: TeamShareTokens.bg,
          width: math.max(1, size * 0.06),
        ),
      ),
      child: ClipOval(
        child: TeamSharePhoto(url: member.avatarUrl, fallback: initials),
      ),
    );
  }
}

/// Os rostos de uma linha pelo tamanho do time: um maior, lado a lado,
/// triângulo, grade 2×2 ou o escudo com as iniciais.
class _FaceCluster extends StatelessWidget {
  const _FaceCluster({
    required this.entry,
    required this.size,
    required this.count,
  });

  final RankingListEntry entry;

  /// Lado de cada rosto (o solo sai 1,2× maior).
  final double size;
  final int count;

  @override
  Widget build(BuildContext context) {
    final faces = _faces(entry);
    RankingEntryMember face(int i) =>
        i < faces.length ? faces[i] : const RankingEntryMember(initials: '');
    final s = size;

    if (count <= 1) return _Face(member: face(0), size: (s * 1.2));
    if (count == 2) {
      final overlap = s * 0.32;
      return SizedBox(
        width: s * 2 - overlap,
        height: s,
        child: Stack(
          children: [
            Positioned(
                left: s - overlap, child: _Face(member: face(1), size: s)),
            _Face(member: face(0), size: s),
          ],
        ),
      );
    }
    if (count == 3) {
      final w = s * 1.7;
      return SizedBox(
        width: w,
        height: s * 1.6,
        child: Stack(
          children: [
            Positioned(
                left: 0, top: s * 0.6, child: _Face(member: face(1), size: s)),
            Positioned(
                left: w - s,
                top: s * 0.6,
                child: _Face(member: face(2), size: s)),
            Positioned(
                left: (w - s) / 2,
                top: 0,
                child: _Face(member: face(0), size: s)),
          ],
        ),
      );
    }
    if (count == 4) {
      final o = s * 0.55;
      return SizedBox(
        width: s + o,
        height: s + o,
        child: Stack(
          children: [
            Positioned(left: o, top: o, child: _Face(member: face(3), size: s)),
            Positioned(left: 0, top: o, child: _Face(member: face(2), size: s)),
            Positioned(left: o, top: 0, child: _Face(member: face(1), size: s)),
            _Face(member: face(0), size: s),
          ],
        ),
      );
    }
    return _Crest(name: entry.displayName, size: (s * 1.35).roundToDouble());
  }
}

class _Crest extends StatelessWidget {
  const _Crest({required this.name, required this.size});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.3),
        gradient: const LinearGradient(
          begin: Alignment(-0.35, -1),
          end: Alignment(0.35, 1),
          colors: [Color(0xFF2A2A2E), Color(0xFF151517)],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: size * 0.1),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            _monogram(name),
            style: TeamShareTokens.display(
              math.max(8, size * 0.32),
              color: _Palette.orangeSoft,
              em: -0.02,
              height: 1,
            ),
          ),
        ),
      ),
    );
  }
}

/// Elenco resumido do quinteto+: quatro rostos e "+N".
class _Roster extends StatelessWidget {
  const _Roster({required this.entry});

  final RankingListEntry entry;

  @override
  Widget build(BuildContext context) {
    const s = 11.5;
    const step = s - 5;
    final faces = _faces(entry).take(4).toList();
    final rest = entry.members.length - faces.length;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: s + step * (faces.length - 1),
          height: s,
          child: Stack(
            children: [
              for (var i = faces.length - 1; i >= 0; i--)
                Positioned(
                  left: step * i,
                  child: _Face(member: faces[i], size: s),
                ),
            ],
          ),
        ),
        if (rest > 0) ...[
          const SizedBox(width: 3),
          Text('+$rest', style: _mono(7, _Palette.mute, em: 0)),
        ],
      ],
    );
  }
}

/// 2º · 1º · 3º, o 1º mais alto e laranja.
class _Podium extends StatelessWidget {
  const _Podium({required this.data, required this.metrics});

  final RankingShareData data;
  final _Metrics metrics;

  @override
  Widget build(BuildContext context) {
    RankingListEntry? at(int rank) =>
        data.podium.where((e) => e.rank == rank).firstOrNull;
    Widget slot(int rank, int flex) {
      final entry = at(rank);
      return Expanded(
        flex: flex,
        child: entry == null
            ? const SizedBox.shrink()
            : _PodiumCard(
                entry: entry,
                isTeam: data.isTeam,
                winner: rank == 1,
                mine: data.mine?.entityId == entry.entityId &&
                    data.mine?.rank == entry.rank,
                metrics: metrics,
              ),
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        slot(2, 100),
        const SizedBox(width: 7),
        slot(1, 115),
        const SizedBox(width: 7),
        slot(3, 100),
      ],
    );
  }
}

class _PodiumCard extends StatelessWidget {
  const _PodiumCard({
    required this.entry,
    required this.isTeam,
    required this.winner,
    required this.mine,
    required this.metrics,
  });

  final RankingListEntry entry;
  final bool isTeam;
  final bool winner;
  final bool mine;
  final _Metrics metrics;

  @override
  Widget build(BuildContext context) {
    final count = _sizeOf(entry, isTeam);
    final base = winner ? metrics.winnerFace : metrics.face;
    final face = count >= 3 ? base * 0.82 : base;
    final support = _supportOf(entry, count);
    final orange = winner || mine;

    return Container(
      padding: EdgeInsets.fromLTRB(5, winner ? 14 : 10, 5, 9),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: winner ? null : (mine ? const Color(0xFF1A0F08) : _Palette.card),
        gradient: winner
            ? LinearGradient(
                begin: const Alignment(-0.3, -1),
                end: const Alignment(0.3, 1),
                stops: const [0, 0.7],
                colors: [
                  AppColors.brand.withValues(alpha: 0.16),
                  _Palette.card,
                ],
              )
            : null,
        border: Border.all(
          color: orange
              ? AppColors.brand.withValues(alpha: mine ? 0.75 : 0.45)
              : _Palette.line,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${entry.rank}º',
            style: _mono(9, orange ? AppColors.brand : _Palette.mute, em: 0),
          ),
          const SizedBox(height: 5),
          _FaceCluster(entry: entry, size: face, count: count),
          const SizedBox(height: 6),
          Text(
            _nameOf(entry, count),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: _sora(winner ? 11 : 10, TeamShareTokens.text),
          ),
          if (count == 4 && support != null) ...[
            const SizedBox(height: 2),
            Text(
              support,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: _sora(7.5, _Palette.mute, w: FontWeight.w500),
            ),
          ],
          if (count >= 5) ...[
            const SizedBox(height: 4),
            _Roster(entry: entry),
          ],
          const SizedBox(height: 3),
          Text(
            '${entry.points}',
            style: AppTypography.mono(
              fontSize: winner ? 17 : 14,
              fontWeight: FontWeight.w700,
              height: 1.15,
              color: orange ? _Palette.orangeSoft : _Palette.points,
            ),
          ),
        ],
      ),
    );
  }
}

/// Uma linha do painel, ou o "···" antes da linha destacada fora do Top.
class _Item {
  const _Item(this.entry);
  const _Item.gap() : entry = null;

  final RankingListEntry? entry;
}

/// O painel das linhas a partir do 4º. Cabendo, uma coluna com os rostos;
/// não cabendo (Top 20 no story, Top 10 no post), duas colunas só com nome.
/// Se nem assim couber (nome do pódio em duas linhas, recorte comprido), o
/// painel inteiro encolhe — vazar pra fora da arte nunca.
class _RowsPanel extends StatelessWidget {
  const _RowsPanel({required this.data});

  final RankingShareData data;

  static const double _maxRow = 30;
  static const double _minRow = 20;
  static const double _minRowTwoColumns = 19;
  static const double _gapRow = 10;
  static const double _vPad = 4;

  /// A borda de 1 do painel, em cima e embaixo: o `Container` empurra o
  /// conteúdo por ela também.
  static const double _border = 2;

  @override
  Widget build(BuildContext context) {
    final items = [
      for (final e in data.rows) _Item(e),
      if (data.mineOutside && data.mine != null) ...[
        const _Item.gap(),
        _Item(data.mine!),
      ],
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final room = constraints.maxHeight - _vPad * 2 - _border;
        final gaps = items.where((i) => i.entry == null).length;
        final rows = items.length - gaps;
        final oneColumn = rows * _minRow + gaps * _gapRow <= room;
        final columns = oneColumn
            ? [items]
            : [
                items.sublist(0, (items.length / 2).ceil()),
                items.sublist((items.length / 2).ceil()),
              ];
        final shapes = [
          for (final c in columns)
            (
              rows: c.where((i) => i.entry != null).length,
              gaps: c.where((i) => i.entry == null).length,
            ),
        ];
        // A linha mais baixa que cabe em TODAS as colunas (a do "···" tem
        // uma linha a menos e o separador a mais).
        final fitted = shapes
            .where((c) => c.rows > 0)
            .map((c) => (room - c.gaps * _gapRow) / c.rows)
            .fold(_maxRow, math.min);
        final rowHeight = fitted.clamp(
          oneColumn ? _minRow : _minRowTwoColumns,
          oneColumn ? _maxRow : _maxRow - 4,
        );
        final columnHeight = shapes
            .map((c) => c.rows * rowHeight + c.gaps * _gapRow)
            .fold(0.0, math.max);
        final natural = columnHeight + _vPad * 2 + _border;

        Widget column(List<_Item> col) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < col.length; i++)
                  col[i].entry == null
                      ? const SizedBox(
                          height: _gapRow,
                          child: Center(
                            child: Text(
                              '···',
                              style: TextStyle(
                                color: _Palette.rank,
                                fontSize: 9,
                                height: 1,
                              ),
                            ),
                          ),
                        )
                      : _ShareRow(
                          entry: col[i].entry!,
                          isTeam: data.isTeam,
                          height: rowHeight,
                          withFaces: oneColumn,
                          mine: identical(col[i].entry, data.mine),
                          divider:
                              i < col.length - 1 && col[i + 1].entry != null,
                        ),
              ],
            );

        final panel = Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: _vPad),
          decoration: BoxDecoration(
            color: _Palette.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x12FFFFFF)),
          ),
          child: columns.length == 1
              ? column(columns.first)
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: column(columns[0])),
                    Container(
                      width: 1,
                      height: columnHeight,
                      margin: const EdgeInsets.symmetric(horizontal: 8),
                      color: _Palette.divider,
                    ),
                    Expanded(child: column(columns[1])),
                  ],
                ),
        );
        if (natural <= constraints.maxHeight + 0.01) return panel;
        return SizedBox(
          height: constraints.maxHeight,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.topCenter,
            child: SizedBox(width: constraints.maxWidth, child: panel),
          ),
        );
      },
    );
  }
}

class _ShareRow extends StatelessWidget {
  const _ShareRow({
    required this.entry,
    required this.isTeam,
    required this.height,
    required this.withFaces,
    required this.mine,
    required this.divider,
  });

  final RankingListEntry entry;
  final bool isTeam;
  final double height;
  final bool withFaces;
  final bool mine;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final count = _sizeOf(entry, isTeam);
    final support = withFaces ? _supportOf(entry, count) : null;
    final face = (count >= 3 ? 13.0 : 17.0).clamp(0.0, height * 0.62);
    final accent = mine ? AppColors.brand : null;

    return Container(
      height: height,
      decoration: BoxDecoration(
        color: mine ? AppColors.brand.withValues(alpha: 0.12) : null,
        border: Border(
          left: mine
              ? const BorderSide(color: AppColors.brand, width: 2)
              : BorderSide.none,
          bottom: divider
              ? const BorderSide(color: _Palette.divider)
              : BorderSide.none,
        ),
      ),
      padding: EdgeInsets.only(left: mine ? 4 : 0, right: mine ? 4 : 0),
      child: Row(
        children: [
          SizedBox(
            width: 17,
            child: Text(
              '${entry.rank}',
              style: _mono(9.5, accent ?? _Palette.rank, em: 0),
            ),
          ),
          if (withFaces) ...[
            const SizedBox(width: 3),
            _FaceCluster(entry: entry, size: face, count: count),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _nameOf(entry, count),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _sora(withFaces ? 10.5 : 9.5, TeamShareTokens.text,
                      w: FontWeight.w600),
                ),
                if (support != null && height >= 26)
                  Text(
                    support,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: _sora(7.5, _Palette.mute, w: FontWeight.w500),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '${entry.points}',
            style: AppTypography.mono(
              fontSize: withFaces ? 10.5 : 9.5,
              fontWeight: FontWeight.w700,
              height: 1.1,
              color: accent ?? TeamShareTokens.text,
            ),
          ),
        ],
      ),
    );
  }
}

/// "RANKING COMPLETO / atleta.nexago.com.br/ranking" + o QR com os filtros.
class _Footer extends StatelessWidget {
  const _Footer({required this.data, required this.qrSize});

  final RankingShareData data;
  final double qrSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('RANKING COMPLETO',
                  style: _mono(8, _Palette.mute, em: 0.16)),
              const SizedBox(height: 3),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  rankingShareLinkLabel,
                  maxLines: 1,
                  style: TeamShareTokens.display(
                    12.5,
                    em: -0.02,
                    height: 1.2,
                    weight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        TeamShareQr(link: data.link, size: qrSize),
      ],
    );
  }
}
