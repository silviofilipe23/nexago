import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../../../core/brand/nexa_hashtag.dart';
import '../../../../../core/ui/share_poster_primitives.dart';
import '../../../domain/focus/campaign_share_data.dart';

/// O card compartilhável da campanha. Porte da arte de
/// `tournaments/campaign/campaign-share-card.ts` do portal — MESMAS medidas,
/// mesmas skins, mesma ordem de blocos.
///
/// É a segunda arte manual que precisa mudar junto com a da web (a primeira é o
/// pôster de partida). Alterou aqui, alterou lá — e vice-versa. As primitivas
/// de texto ficam em `core/ui/share_poster_primitives.dart` justamente para que
/// as duas usem a mesma régua.

const double campaignCardWidth = 1080;
const double campaignCardHeight = 1920;

const double _m = 72;
const double _logoSize = 60;
const double _logoTop = 85;
const double _logoGap = 18;

const Color _orange = Color(0xFFFF6A1A);
const Color _ink = Color(0xFFE6EAEF);
const Color _mute = Color(0xB3E6EAEF);
const Color _dim = Color(0x80E6EAEF);
const Color _winGreen = Color(0xFF2BD17E);
const Color _lossRed = Color(0xFFFF3B30);

/// O painel é ancorado no RODAPÉ e cresce pra cima: é o que faz a arte
/// funcionar com número diferente de jogos.
const double _panelBottom = 1672;
const double _panelPadX = 34;
const double _panelHeadH = 96;
const double _panelPadBottom = 26;
const double _rowPitchComfort = 130;
const double _rowPitchTight = 104;
const double _heroBottom = 556 + 95;
const double _panelGap = 24;

class CampaignSkin {
  const CampaignSkin({
    required this.bg,
    required this.ink,
    required this.mute,
    required this.dim,
    required this.title,
    required this.halo,
    required this.badge,
    required this.badgeBg,
    required this.badgeInk,
    required this.wordmarkNexa,
    required this.wordmarkGo,
    required this.markPlate,
    required this.ring,
  });

  final Color bg;
  final Color ink;
  final Color mute;
  final Color dim;
  final Color title;
  final Color halo;

  /// `null` quando o próprio título já diz tudo.
  final String? badge;
  final Color badgeBg;
  final Color badgeInk;
  final Color wordmarkNexa;
  final Color wordmarkGo;

  /// Placa arredondada atrás da marca. Existe por um motivo concreto: a marca é
  /// um "N" LARANJA, e no card do campeão — fundo laranja — ela sumia. Nos
  /// cards escuros a marca contrasta sozinha e a placa fica de fora.
  final Color? markPlate;
  final Color ring;
}

const Map<CampaignPlacement, CampaignSkin> _skins = {
  CampaignPlacement.champion: CampaignSkin(
    bg: _orange,
    ink: Color(0xFF0A0A0A),
    mute: Color(0xA80A0A0A),
    dim: Color(0x800A0A0A),
    title: Color(0xFF0A0A0A),
    halo: Color(0x29FFFFFF),
    badge: null,
    badgeBg: Color(0xFF0A0A0A),
    badgeInk: _orange,
    wordmarkNexa: Color(0xFF0A0A0A),
    wordmarkGo: Color(0xFF0A0A0A),
    markPlate: Color(0xFF0A0A0A),
    ring: Color(0x470A0A0A),
  ),
  CampaignPlacement.runnerUp: CampaignSkin(
    bg: Color(0xFF0A0A0A),
    ink: _ink,
    mute: _mute,
    dim: _dim,
    title: Color(0xFFC8CDD4),
    halo: Color(0x24C8CDD4),
    badge: '2º LUGAR',
    badgeBg: Color(0x29C8CDD4),
    badgeInk: Color(0xFFE6EAEF),
    wordmarkNexa: _ink,
    wordmarkGo: _orange,
    markPlate: null,
    ring: Color(0x2EFFFFFF),
  ),
  CampaignPlacement.third: CampaignSkin(
    bg: Color(0xFF0A0A0A),
    ink: _ink,
    mute: _mute,
    dim: _dim,
    title: Color(0xFFC88A4F),
    halo: Color(0x29C88A4F),
    badge: '3º LUGAR',
    badgeBg: Color(0x2EC88A4F),
    badgeInk: Color(0xFFE8B98A),
    wordmarkNexa: _ink,
    wordmarkGo: _orange,
    markPlate: null,
    ring: Color(0x2EFFFFFF),
  ),
  CampaignPlacement.none: CampaignSkin(
    bg: Color(0xFF0A0A0A),
    ink: _ink,
    mute: _mute,
    dim: _dim,
    title: _orange,
    halo: Color(0x29FF6A1A),
    badge: null,
    badgeBg: Color(0x2EFF6A1A),
    badgeInk: Color(0xFFFFB184),
    wordmarkNexa: _ink,
    wordmarkGo: _orange,
    markPlate: null,
    ring: Color(0x2EFFFFFF),
  ),
};

const Map<CampaignPlacement, String> _titles = {
  CampaignPlacement.champion: 'CAMPEÃO',
  CampaignPlacement.runnerUp: 'VICE-CAMPEÃO',
  CampaignPlacement.third: 'TERCEIRO',
  CampaignPlacement.none: 'CAMPANHA',
};

const List<List<Color>> _avatarGradient = [
  [Color(0xFFFF6A1A), Color(0xFFC2185B)],
  [Color(0xFF2BD17E), Color(0xFF1E7A4D)],
];

TextStyle _mono(int weight, double size, {Color? color}) =>
    posterStyle('JetBrains Mono', weight, size, color: color ?? _ink);

TextStyle _sora(int weight, double size, {Color? color}) =>
    posterStyle('Sora', weight, size, color: color ?? _ink);

/// Assets que a arte usa e que podem faltar — a marca e as fotos. Sem eles o
/// desenho segue, com o fallback de cada bloco.
class CampaignPosterAssets {
  const CampaignPosterAssets({this.photos = const {}, this.logo});

  final Map<String, ui.Image?> photos;
  final ui.Image? logo;

  static const empty = CampaignPosterAssets();
}

class CampaignSharePosterPainter extends CustomPainter {
  const CampaignSharePosterPainter({required this.data, required this.assets});

  final CampaignShareData data;
  final CampaignPosterAssets assets;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / campaignCardWidth);
    drawCampaignSharePoster(canvas, data, assets);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CampaignSharePosterPainter old) =>
      old.data != data || old.assets != assets;
}

void drawCampaignSharePoster(
  Canvas canvas,
  CampaignShareData data,
  CampaignPosterAssets assets,
) {
  final skin = _skins[data.placement]!;
  _drawBackdrop(canvas, skin);
  _drawHeader(canvas, data, assets.logo, skin);
  _drawHero(canvas, data, assets, skin);
  _drawPanel(canvas, data, skin);
  _drawFooter(canvas, data, skin);
}

void _drawBackdrop(Canvas canvas, CampaignSkin skin) {
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, campaignCardWidth, campaignCardHeight),
    Paint()..color = skin.bg,
  );

  // Halo no canto superior direito — o disco claro do protótipo.
  final center = const Offset(campaignCardWidth - 60, 200);
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, campaignCardWidth, 900),
    Paint()
      ..shader = ui.Gradient.radial(
        center,
        640,
        [skin.halo, const Color(0x00000000)],
        [0, 1],
      ),
  );
}

/// Marca + wordmark à esquerda, intervalo de datas à direita. Sem a marca, o
/// wordmark volta pra margem em vez de deixar o buraco dela — mesma regra do
/// pôster de partida.
void _drawHeader(
  Canvas canvas,
  CampaignShareData data,
  ui.Image? logo,
  CampaignSkin skin,
) {
  if (logo != null) {
    if (skin.markPlate != null) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(
            _m - 8,
            _logoTop - 8,
            _logoSize + 16,
            _logoSize + 16,
          ),
          const Radius.circular(18),
        ),
        Paint()..color = skin.markPlate!,
      );
    }
    canvas.drawImageRect(
      logo,
      Rect.fromLTWH(0, 0, logo.width.toDouble(), logo.height.toDouble()),
      const Rect.fromLTWH(_m, _logoTop, _logoSize, _logoSize),
      Paint(),
    );
  }

  final wordmarkX = logo != null ? _m + _logoSize + _logoGap : _m;
  final nexaStyle = _sora(800, 44, color: skin.wordmarkNexa);
  posterFillText(canvas, 'nexa', nexaStyle, wordmarkX, 138);
  posterFillText(
    canvas,
    'GO',
    _sora(800, 44, color: skin.wordmarkGo),
    wordmarkX + posterMeasure('nexa', nexaStyle),
    138,
  );

  final dateLabel = data.dateRangeLabel;
  if (dateLabel != null) {
    final style = _mono(500, 24, color: skin.dim);
    final text = dateLabel.toUpperCase();
    final width = posterTrackedWidth(text, style, 6);
    posterTracked(
      canvas,
      text,
      style,
      campaignCardWidth - _m - width,
      128,
      6,
      align: PosterAlign.left,
    );
  }
}

/// Kicker, título gigante, nome da dupla, fotos e cartel.
void _drawHero(
  Canvas canvas,
  CampaignShareData data,
  CampaignPosterAssets assets,
  CampaignSkin skin,
) {
  const maxWidth = campaignCardWidth - _m * 2;

  final kickerStyle = _mono(500, 26, color: skin.mute);
  final kicker = data.categoryLine.toUpperCase();
  posterTracked(
    canvas,
    posterTruncate(kicker, kickerStyle, maxWidth - 220),
    kickerStyle,
    _m,
    212,
    8,
    align: PosterAlign.left,
  );

  if (skin.badge != null) {
    final kickerW = posterTrackedWidth(kicker, kickerStyle, 8);
    _drawPill(
      canvas,
      skin.badge!,
      _mono(700, 22, color: skin.badgeInk),
      _m + kickerW + 26,
      203,
      20,
      44,
      skin.badgeBg,
    );
  }

  // Título: o maior elemento do card. `posterFitFont` encolhe, `posterTruncate`
  // garante o encaixe — sozinho o fit para no piso e devolve o texto inteiro,
  // vazando a margem.
  final title = _titles[data.placement]!;
  final titleStyle = posterFitFont(
    title,
    maxWidth,
    168,
    96,
    (s) => _sora(800, s, color: skin.title),
  );
  posterFillText(
    canvas,
    posterTruncate(title, titleStyle, maxWidth),
    titleStyle,
    _m,
    334,
  );

  final teamStyle = posterFitFont(
    data.teamName,
    maxWidth,
    58,
    34,
    (s) => _sora(800, s, color: skin.ink),
    step: 2,
  );
  posterFillText(
    canvas,
    posterTruncate(data.teamName, teamStyle, maxWidth),
    teamStyle,
    _m,
    424,
  );

  // Fotos sobrepostas: a segunda desenha por cima.
  const r = 86.0;
  const cy = 556.0;
  const cx1 = _m + r;
  const cx2 = cx1 + r * 1.5;
  for (var i = 0; i < data.players.length && i < 2; i++) {
    final p = data.players[i];
    _drawAvatar(
      canvas,
      p.photo != null ? assets.photos[p.photo!] : null,
      p.initial,
      i,
      i == 0 ? cx1 : cx2,
      cy,
      r,
      skin,
    );
  }

  posterFillTextMiddle(
    canvas,
    '${data.wins}V · ${data.losses}D',
    _mono(700, 34, color: skin.mute),
    cx2 + r + 44 + 90,
    cy + 2,
  );
}

void _drawAvatar(
  Canvas canvas,
  ui.Image? photo,
  String initial,
  int index,
  double cx,
  double cy,
  double r,
  CampaignSkin skin,
) {
  final center = Offset(cx, cy);

  if (photo != null) {
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: center, radius: r)));
    canvas.drawImageRect(
      photo,
      Rect.fromLTWH(0, 0, photo.width.toDouble(), photo.height.toDouble()),
      Rect.fromCircle(center: center, radius: r),
      Paint(),
    );
    canvas.restore();
  } else {
    final colors = _avatarGradient[index % _avatarGradient.length];
    canvas.drawCircle(
      center,
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(cx - r, cy - r),
          Offset(cx + r, cy + r),
          colors,
        ),
    );
    posterFillTextMiddle(
      canvas,
      initial,
      _sora(800, r * 0.8, color: const Color(0xFFC9CED6)),
      cx,
      cy,
    );
  }

  canvas.drawCircle(
    center,
    r,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..color = skin.ring,
  );
}

void _drawPill(
  Canvas canvas,
  String text,
  TextStyle style,
  double x,
  double y,
  double radius,
  double height,
  Color bg,
) {
  final width = posterMeasure(text, style) + 40;
  canvas.drawRRect(
    RRect.fromRectAndRadius(
      Rect.fromLTWH(x, y, width, height),
      Radius.circular(radius),
    ),
    Paint()..color = bg,
  );
  posterFillTextMiddle(canvas, text, style, x + width / 2, y + height / 2);
}

/// O painel da trajetória, ancorado no rodapé e crescendo pra cima.
void _drawPanel(
  Canvas canvas,
  CampaignShareData data,
  CampaignSkin skin,
) {
  final rows = data.rows;
  if (rows.isEmpty) return;

  // Com poucas linhas sobra respiro; com muitas o painel aperta o passo para
  // não encostar no bloco de cima.
  final pitch = rows.length <= 4 ? _rowPitchComfort : _rowPitchTight;
  final bodyHeight = pitch * rows.length;
  final panelHeight = _panelHeadH + bodyHeight + _panelPadBottom;
  var panelTop = _panelBottom - panelHeight;
  final minTop = _heroBottom + _panelGap;
  if (panelTop < minTop) panelTop = minTop;

  final rect = Rect.fromLTWH(
    _m - _panelPadX,
    panelTop,
    campaignCardWidth - (_m - _panelPadX) * 2,
    _panelBottom - panelTop,
  );
  canvas.drawRRect(
    RRect.fromRectAndRadius(rect, const Radius.circular(28)),
    Paint()..color = const Color(0x0DFFFFFF),
  );

  final headStyle = _mono(500, 22, color: _dim);
  posterTracked(
    canvas,
    'TRAJETÓRIA',
    headStyle,
    _m,
    panelTop + 56,
    5,
    align: PosterAlign.left,
  );

  final setsStyle = _mono(700, 24, color: _dim);
  final setsText = '${data.setsWon}–${data.setsLost} SETS';
  posterFillText(
    canvas,
    setsText,
    setsStyle,
    campaignCardWidth - _m - posterMeasure(setsText, setsStyle),
    panelTop + 56,
  );

  var cy = panelTop + _panelHeadH + pitch / 2;
  for (final row in rows) {
    _drawRow(canvas, row, cy, _m, campaignCardWidth - _m);
    cy += pitch;
  }
}

void _drawRow(
  Canvas canvas,
  CampaignRow row,
  double cy,
  double left,
  double right,
) {
  const badgeSize = 46.0;

  // Selo V/D — quadrado arredondado, o marcador do protótipo.
  final badgeRect = Rect.fromLTWH(left, cy - badgeSize / 2, badgeSize, badgeSize);
  if (row is CampaignMatchRow) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(badgeRect, const Radius.circular(13)),
      Paint()..color = row.won ? _winGreen : _lossRed,
    );
    posterFillTextMiddle(
      canvas,
      row.won ? 'V' : 'D',
      _sora(800, 24,
          color: row.won ? const Color(0xFF08331F) : const Color(0xFF3A0906)),
      left + badgeSize / 2,
      cy + 1,
    );
  } else {
    canvas.drawRRect(
      RRect.fromRectAndRadius(badgeRect, const Radius.circular(13)),
      Paint()..color = const Color(0x1AFFFFFF),
    );
  }

  final textLeft = left + badgeSize + 26;

  // A coluna da direita é medida primeiro: é ela que limita a largura do nome
  // do adversário.
  final isMatch = row is CampaignMatchRow;
  final rightText = isMatch
      ? row.setScore
      : '${(row as CampaignGroupRow).wins}V ${row.losses}D';
  final rightStyle = isMatch ? _mono(800, 46) : _mono(700, 32);
  final rightW = posterMeasure(rightText, rightStyle);

  final subText = isMatch
      ? row.partials.join('  ')
      : '${(row as CampaignGroupRow).games} jogos';
  final subStyle = _mono(500, 22, color: _dim);
  final subW = posterMeasure(subText, subStyle);
  final textRight = right - (rightW > subW ? rightW : subW) - 30;

  final phaseLabel =
      isMatch ? row.phaseLabel : 'Fase de grupos';
  posterTracked(
    canvas,
    phaseLabel.toUpperCase(),
    _mono(500, 20, color: _dim),
    textLeft,
    cy - 14,
    4,
    align: PosterAlign.left,
  );

  final nameStyle = _sora(700, 32);
  final name = isMatch ? row.opponentName : 'Fase de grupos';
  final nameWidth = textRight - textLeft;
  posterFillText(
    canvas,
    posterTruncate(name, nameStyle, nameWidth < 120 ? 120 : nameWidth),
    nameStyle,
    textLeft,
    cy + 26,
  );

  posterFillText(
    canvas,
    rightText,
    rightStyle,
    right - rightW,
    cy + 2,
  );
  posterFillText(canvas, subText, subStyle, right - subW, cy + 34);
}

void _drawFooter(
  Canvas canvas,
  CampaignShareData data,
  CampaignSkin skin,
) {
  const maxWidth = campaignCardWidth - _m * 2;
  final nameStyle = posterFitFont(
    data.tournamentName,
    maxWidth,
    38,
    26,
    (s) => _sora(700, s, color: skin.ink),
    step: 2,
  );
  posterFillText(
    canvas,
    posterTruncate(data.tournamentName, nameStyle, maxWidth),
    nameStyle,
    _m,
    1770,
  );

  final meta = [
    ?data.locationName,
    ?data.winRateLabel,
  ].join(' · ');
  if (meta.isNotEmpty) {
    posterFillText(
      canvas,
      posterTruncate(meta, _mono(500, 26, color: skin.dim), maxWidth),
      _mono(500, 26, color: skin.dim),
      _m,
      1822,
    );
  }

  // A hashtag ganha linha própria, na cor de acento da skin: no card do campeão
  // o rodapé é escuro sobre laranja, e um laranja fixo aqui sumiria no fundo.
  posterTracked(
    canvas,
    nexaHashtagStamp,
    _mono(700, 24, color: skin.wordmarkGo),
    _m,
    1874,
    4,
    align: PosterAlign.left,
  );
}
