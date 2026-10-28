import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../auth/widgets/auth_form_widgets.dart' show kNexagoLogoAsset;
import '../../../domain/team_profile/team_share_card.dart';

/// Paleta e medidas dos cards de equipe. A arte do canvas é 1080×1920; aqui a
/// base é 360×640 (um terço) e a captura sai em 3× — toda medida do canvas
/// aparece dividida por 3.
abstract final class TeamShareTokens {
  TeamShareTokens._();

  static const Size size = Size(360, 640);
  static const double pad = 28;

  static const Color bg = Color(0xFF050505);
  static const Color surface = Color(0xFF131316);
  static const Color ink = Color(0xFF0A0A0A);
  static const Color text = Color(0xFFF4F4F5);
  static const Color mute = Color(0x9EF4F4F5); // .62
  static const Color dim = Color(0x66F4F4F5); // .40
  static const Color line = Color(0x14FFFFFF); // .08
  static const Color lineStrong = Color(0x29FFFFFF); // .16
  static const Color green = Color(0xFF2BD17E);
  static const Color red = Color(0xFFFF3B30);

  /// Tinta sobre o laranja, nas opacidades do canvas.
  static const Color inkMute = Color(0x9E0A0A0A); // .62
  static const Color inkSoft = Color(0x660A0A0A); // .40
  static const Color inkGhost = Color(0x140A0A0A); // .08

  static const LinearGradient orange = LinearGradient(
    // 158deg do canvas.
    begin: Alignment(-0.37, -1),
    end: Alignment(0.37, 1),
    colors: [Color(0xFFFF7A28), AppColors.brand, Color(0xFFE5560E)],
    stops: [0, 0.42, 1],
  );

  /// Rótulo em mono caixa alta (os "RANKING", "PONTOS" do canvas).
  static TextStyle label(double size, {Color color = mute, double em = 0.14}) =>
      AppTypography.mono(
        fontSize: size,
        fontWeight: FontWeight.w700,
        letterSpacing: size * em,
        height: 1.2,
        color: color,
      );

  /// Número/nome em Sora 800 apertado.
  static TextStyle display(
    double size, {
    Color color = text,
    double em = -0.04,
    double height = 0.95,
    FontWeight weight = FontWeight.w800,
  }) =>
      AppTypography.soraRegular(
        fontSize: size,
        fontWeight: weight,
        letterSpacing: size * em,
        height: height,
        color: color,
      );

  static Color hueColor(double hue, double s, double l, [double a = 1]) =>
      HSLColor.fromAHSL(a, hue % 360, s, l).toColor();
}

/// Marca + "nexaGO" (o GO laranja; tinta escura no fundo laranja).
class TeamShareWordmark extends StatelessWidget {
  const TeamShareWordmark({super.key, this.onOrange = false});

  final bool onOrange;

  @override
  Widget build(BuildContext context) {
    final fg = onOrange ? TeamShareTokens.ink : TeamShareTokens.text;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          kNexagoLogoAsset,
          width: 19,
          height: 19,
          // A marca é laranja: no fundo laranja ela sumiria.
          color: onOrange ? TeamShareTokens.ink : null,
          colorBlendMode: onOrange ? BlendMode.srcIn : null,
          errorBuilder: (_, _, _) => const SizedBox.shrink(),
        ),
        const SizedBox(width: 6),
        Text.rich(
          TextSpan(
            children: [
              const TextSpan(text: 'nexa'),
              TextSpan(
                text: 'GO',
                style: TextStyle(color: onOrange ? fg : AppColors.brand),
              ),
            ],
          ),
          style: TeamShareTokens.display(12.5, color: fg, em: -0.03, height: 1),
        ),
      ],
    );
  }
}

/// Texto que encolhe até caber: tenta cada tamanho de [sizes] (do maior para
/// o menor) em [maxLines]; nenhum cabendo, fica o último com reticências.
/// Encolher sozinho não garante encaixe — nome comprido no menor tamanho
/// ainda vazaria, por isso o corte no fim.
///
/// Quebrando em mais de uma linha, estreita a caixa até a menor largura com
/// as mesmas linhas (o `text-wrap: balance` do canvas): "Arena / Costa Sul"
/// em vez de "Arena Costa / Sul".
class TeamShareFitText extends StatelessWidget {
  const TeamShareFitText({
    super.key,
    required this.spans,
    required this.style,
    required this.sizes,
    this.maxLines = 2,
    this.textAlign = TextAlign.start,
  });

  final List<InlineSpan> spans;

  /// Estilo base; o tamanho vem de [sizes] e o espaçamento acompanha.
  final TextStyle style;
  final List<double> sizes;
  final int maxLines;
  final TextAlign textAlign;

  TextStyle _at(double size) {
    final base = style.fontSize ?? size;
    final em = (style.letterSpacing ?? 0) / base;
    return style.copyWith(fontSize: size, letterSpacing: size * em);
  }

  /// Linhas em [width]; `null` quando passa de [maxLines].
  int? _lines(double size, double width) {
    final painter = TextPainter(
      text: TextSpan(children: spans, style: _at(size)),
      maxLines: maxLines,
      textDirection: TextDirection.ltr,
      textScaler: TextScaler.noScaling,
    )..layout(maxWidth: width);
    final lines =
        painter.didExceedMaxLines ? null : painter.computeLineMetrics().length;
    painter.dispose();
    return lines;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final full = constraints.maxWidth;
        var chosen = sizes.last;
        int? lines;
        for (final size in sizes) {
          lines = _lines(size, full);
          if (lines != null) {
            chosen = size;
            break;
          }
        }
        var width = full;
        if (lines != null && lines > 1) {
          var lo = full / 2;
          var hi = full;
          for (var i = 0; i < 8; i++) {
            final mid = (lo + hi) / 2;
            if (_lines(chosen, mid) == lines) {
              hi = mid;
            } else {
              lo = mid;
            }
          }
          width = hi.ceilToDouble();
        }
        final text = Text.rich(
          TextSpan(children: spans),
          style: _at(chosen),
          maxLines: maxLines,
          overflow: TextOverflow.ellipsis,
          textAlign: textAlign,
          textScaler: TextScaler.noScaling,
        );
        return Align(
          alignment: textAlign == TextAlign.center
              ? Alignment.topCenter
              : Alignment.topLeft,
          widthFactor: 1,
          child: SizedBox(width: width, child: text),
        );
      },
    );
  }
}

/// Foto do atleta (sem fade: a captura sai com o que estiver pintado) ou o
/// [fallback] enquanto não carrega e quando não existe.
class TeamSharePhoto extends StatelessWidget {
  const TeamSharePhoto({super.key, required this.url, required this.fallback});

  final String? url;
  final Widget fallback;

  @override
  Widget build(BuildContext context) {
    final src = url;
    if (src == null) return fallback;
    return Image(
      image: CachedNetworkImageProvider(src),
      fit: BoxFit.cover,
      frameBuilder: (_, child, frame, sync) =>
          frame == null && !sync ? fallback : child,
      errorBuilder: (_, _, _) => fallback,
    );
  }
}

/// Avatar redondo: foto ou iniciais num degradê do matiz do atleta.
class TeamShareAvatar extends StatelessWidget {
  const TeamShareAvatar({
    super.key,
    required this.member,
    required this.hue,
    required this.size,
    this.ring = TeamShareTokens.bg,
  });

  final TeamShareMember member;
  final double hue;
  final double size;
  final Color ring;

  @override
  Widget build(BuildContext context) {
    final initials = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            TeamShareTokens.hueColor(hue, 0.18, 0.23),
            TeamShareTokens.hueColor(hue, 0.15, 0.12),
          ],
        ),
      ),
      child: Center(
        child: Text(
          member.initials,
          textScaler: TextScaler.noScaling,
          style: TeamShareTokens.display(
            size * 0.34,
            color: const Color(0xEBF4F4F5),
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
          color: ring,
          width: (size * 0.045).clamp(1.0, double.infinity),
        ),
      ),
      child: ClipOval(
        child: TeamSharePhoto(url: member.avatarUrl, fallback: initials),
      ),
    );
  }
}

/// Matizes dos atletas sem foto: deslocados a partir do matiz da equipe para
/// os vizinhos não saírem iguais.
double teamShareMemberHue(double teamHue, int index) =>
    (teamHue + 24 + index * 67) % 360;

/// Elenco em linha, sobreposto (o da esquerda por cima).
class TeamShareRosterRow extends StatelessWidget {
  const TeamShareRosterRow({
    super.key,
    required this.data,
    required this.size,
    this.ring = TeamShareTokens.bg,
    this.max = 8,
  });

  final TeamShareCardData data;
  final double size;
  final Color ring;
  final int max;

  @override
  Widget build(BuildContext context) {
    final list = data.members.take(max).toList();
    final step = size * 0.78;
    return SizedBox(
      width: list.isEmpty ? 0 : size + step * (list.length - 1),
      height: size,
      child: Stack(
        children: [
          for (var i = list.length - 1; i >= 0; i--)
            Positioned(
              left: step * i,
              child: TeamShareAvatar(
                member: list[i],
                hue: teamShareMemberHue(data.hue, i),
                size: size,
                ring: ring,
              ),
            ),
        ],
      ),
    );
  }
}

/// Escudo: a equipe não tem logo, então são as iniciais num quadrado com o
/// matiz dela (no fundo laranja, preto com as iniciais laranja).
class TeamShareCrest extends StatelessWidget {
  const TeamShareCrest({
    super.key,
    required this.data,
    required this.size,
    this.onOrange = false,
  });

  final TeamShareCardData data;
  final double size;
  final bool onOrange;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(size * 0.26);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: radius,
        color: onOrange ? TeamShareTokens.ink : null,
        gradient: onOrange
            ? null
            : LinearGradient(
                begin: const Alignment(-0.5, -1),
                end: const Alignment(0.5, 1),
                colors: [
                  TeamShareTokens.hueColor(data.hue, 0.40, 0.30),
                  TeamShareTokens.hueColor(data.hue + 20, 0.30, 0.13),
                ],
              ),
        border: onOrange
            ? null
            : Border.all(color: TeamShareTokens.lineStrong, width: 0.7),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (!onOrange)
              CustomPaint(
                painter: TeamShareStripesPainter(
                  color: Colors.white.withValues(alpha: 0.12),
                  gap: 7.3,
                ),
              ),
            Center(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: size * 0.08),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    data.monogram,
                    textScaler: TextScaler.noScaling,
                    style: TeamShareTokens.display(
                      size * 0.3,
                      color: onOrange ? AppColors.brand : TeamShareTokens.text,
                      em: -0.03,
                      height: 1,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Listras diagonais finas (o `repeating-linear-gradient(135deg…)` do canvas).
class TeamShareStripesPainter extends CustomPainter {
  const TeamShareStripesPainter({
    required this.color,
    required this.gap,
    this.width = 0.7,
  });

  final Color color;
  final double gap;
  final double width;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = width;
    // Linhas a 45° da esquerda-baixo para a direita-cima, cobrindo o retângulo.
    for (var x = -size.height; x < size.width; x += gap) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant TeamShareStripesPainter old) =>
      old.color != color || old.gap != gap || old.width != width;
}

/// Um número com o rótulo em cima ("RANKING / 3º").
class TeamShareStat extends StatelessWidget {
  const TeamShareStat({
    super.key,
    required this.label,
    required this.value,
    this.suffix,
    this.size = 25,
  });

  final String label;
  final String value;
  final String? suffix;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          maxLines: 1,
          textScaler: TextScaler.noScaling,
          style: TeamShareTokens.label(7.3),
        ),
        const SizedBox(height: 3.3),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(text: value),
                if (suffix != null)
                  TextSpan(
                    text: suffix,
                    style: TeamShareTokens.display(
                      size * 0.42,
                      color: TeamShareTokens.dim,
                    ),
                  ),
              ],
            ),
            maxLines: 1,
            textScaler: TextScaler.noScaling,
            style: TeamShareTokens.display(size).copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

/// Faixa de números entre duas linhas (cards de perfil).
class TeamShareStatStrip extends StatelessWidget {
  const TeamShareStatStrip({super.key, required this.stats});

  final List<TeamShareStat> stats;

  @override
  Widget build(BuildContext context) {
    const border = BorderSide(color: TeamShareTokens.line, width: 0.5);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14.7),
      decoration: const BoxDecoration(
        border: Border(top: border, bottom: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < stats.length; i++) ...[
            if (i > 0) const SizedBox(width: 10),
            Expanded(child: stats[i]),
          ],
        ],
      ),
    );
  }
}

/// Três blocos (o primeiro laranja): RANKING · PONTOS · APROV.
class TeamShareStatBlocks extends StatelessWidget {
  const TeamShareStatBlocks({super.key, required this.data});

  final TeamShareCardData data;

  @override
  Widget build(BuildContext context) {
    final blocks = [
      ('RANKING', data.rankLabel),
      ('PONTOS', teamShareThousands(data.points)),
      ('APROV.', '${data.winRatePercent}%'),
    ];
    return Row(
      children: [
        for (var i = 0; i < blocks.length; i++) ...[
          if (i > 0) const SizedBox(width: 6.7),
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 9.3, 10, 9.3),
              decoration: BoxDecoration(
                color: i == 0 ? AppColors.brand : TeamShareTokens.surface,
                borderRadius: BorderRadius.circular(9.3),
                border: i == 0
                    ? null
                    : Border.all(color: TeamShareTokens.line, width: 0.5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    blocks[i].$1,
                    textScaler: TextScaler.noScaling,
                    style: TeamShareTokens.label(
                      7,
                      color: i == 0
                          ? const Color(0xA60A0A0A)
                          : TeamShareTokens.mute,
                    ),
                  ),
                  const SizedBox(height: 3.3),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      blocks[i].$2,
                      maxLines: 1,
                      textScaler: TextScaler.noScaling,
                      style: TeamShareTokens.display(
                        21.3,
                        color:
                            i == 0 ? TeamShareTokens.ink : TeamShareTokens.text,
                        height: 1,
                      ).copyWith(
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// "14.820": milhar com ponto, como o canvas (`toLocaleString('pt-BR')`).
String teamShareThousands(int n) {
  final digits = n.abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write('.');
    out.write(digits[i]);
  }
  return out.toString();
}

/// Últimos jogos: V verde, D vermelho.
class TeamShareForm extends StatelessWidget {
  const TeamShareForm({super.key, required this.form, this.size = 18});

  final List<bool> form;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < form.length; i++) ...[
          if (i > 0) const SizedBox(width: 3.3),
          Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: (form[i] ? TeamShareTokens.green : TeamShareTokens.red)
                  .withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(size * 0.26),
            ),
            child: Text(
              form[i] ? 'V' : 'D',
              textScaler: TextScaler.noScaling,
              style: AppTypography.mono(
                fontSize: size * 0.42,
                fontWeight: FontWeight.w700,
                height: 1,
                color: form[i] ? TeamShareTokens.green : TeamShareTokens.red,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// QR do perfil da equipe num quadrado claro.
class TeamShareQr extends StatelessWidget {
  const TeamShareQr({super.key, required this.link, this.size = 50});

  final String link;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.09),
      decoration: BoxDecoration(
        color: TeamShareTokens.text,
        borderRadius: BorderRadius.circular(size * 0.15),
      ),
      child: QrImageView(
        data: link,
        padding: EdgeInsets.zero,
        backgroundColor: TeamShareTokens.text,
        eyeStyle: const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color: TeamShareTokens.ink,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color: TeamShareTokens.ink,
        ),
      ),
    );
  }
}

/// Rodapé dos cards escuros: "SIGA A EQUIPE / atleta.nexago.com.br" + QR.
class TeamShareFooter extends StatelessWidget {
  const TeamShareFooter({super.key, required this.data});

  final TeamShareCardData data;

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
              Text(
                data.followLabel,
                textScaler: TextScaler.noScaling,
                style: TeamShareTokens.label(6.7, em: 0.1),
              ),
              const SizedBox(height: 2),
              Text(
                data.linkLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textScaler: TextScaler.noScaling,
                style: TeamShareTokens.display(
                  10.7,
                  em: -0.02,
                  height: 1.2,
                  weight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        TeamShareQr(link: data.link),
      ],
    );
  }
}

/// Linha de cima: marca à esquerda, [trailing] à direita.
class TeamShareTopBar extends StatelessWidget {
  const TeamShareTopBar({
    super.key,
    required this.trailing,
    this.onOrange = false,
  });

  final Widget trailing;
  final bool onOrange;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        TeamShareWordmark(onOrange: onOrange),
        const Spacer(),
        trailing,
      ],
    );
  }
}

/// Selo escuro translúcido do topo das fotos ("5 ATLETAS").
class TeamSharePill extends StatelessWidget {
  const TeamSharePill({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 19.3,
      padding: const EdgeInsets.symmetric(horizontal: 8.7),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        maxLines: 1,
        textScaler: TextScaler.noScaling,
        style: TeamShareTokens.label(8, color: TeamShareTokens.text, em: 0.12),
      ),
    );
  }
}

/// Uma foto de atleta no mosaico: a foto, ou as iniciais grandes e apagadas
/// sobre o matiz dele.
class TeamSharePhotoTile extends StatelessWidget {
  const TeamSharePhotoTile({
    super.key,
    required this.member,
    required this.hue,
    this.initialsSize = 53,
    this.initialsAlignment = Alignment.center,
  });

  final TeamShareMember member;
  final double hue;
  final double initialsSize;

  final Alignment initialsAlignment;

  @override
  Widget build(BuildContext context) {
    final fallback = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: const Alignment(-0.35, -1),
          end: const Alignment(0.35, 1),
          colors: [
            TeamShareTokens.hueColor(hue, 0.28, 0.26),
            TeamShareTokens.hueColor(hue + 18, 0.22, 0.10),
          ],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          CustomPaint(
            painter: TeamShareStripesPainter(
              color: Colors.white.withValues(alpha: 0.08),
              gap: 9.3,
            ),
          ),
          Align(
            alignment: initialsAlignment,
            child: Text(
              member.initials,
              textScaler: TextScaler.noScaling,
              style: TeamShareTokens.display(
                initialsSize,
                color: Colors.white.withValues(alpha: 0.18),
                height: 1,
              ),
            ),
          ),
        ],
      ),
    );
    return SizedBox.expand(
      child: TeamSharePhoto(url: member.avatarUrl, fallback: fallback),
    );
  }
}

/// Lista "ÚLTIMAS ETAPAS" do card escuro do ranking.
class TeamShareStages extends StatelessWidget {
  const TeamShareStages({super.key, required this.stages});

  final List<TeamShareStage> stages;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'ÚLTIMAS ETAPAS',
          textScaler: TextScaler.noScaling,
          style: TeamShareTokens.label(7),
        ),
        for (final stage in stages) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  stage.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textScaler: TextScaler.noScaling,
                  style: TeamShareTokens.display(
                    11.3,
                    em: -0.02,
                    height: 1.2,
                    weight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                stage.result,
                textScaler: TextScaler.noScaling,
                style: TeamShareTokens.display(
                  12.7,
                  em: 0,
                  height: 1.2,
                  color: stage.isTitle ? AppColors.brand : TeamShareTokens.mute,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Fundo laranja com as listras e o número gigante apagado atrás.
class TeamShareOrangeBackdrop extends StatelessWidget {
  const TeamShareOrangeBackdrop({super.key, required this.ghost});

  /// "3º" gigante atrás de tudo.
  final String ghost;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(gradient: TeamShareTokens.orange),
        ),
        CustomPaint(
          painter: TeamShareStripesPainter(
            color: TeamShareTokens.ink.withValues(alpha: 0.1),
            gap: 19.3,
          ),
        ),
        Positioned(
          right: -13,
          top: 50,
          child: Text(
            ghost,
            maxLines: 1,
            softWrap: false,
            textScaler: TextScaler.noScaling,
            style: TeamShareTokens.display(
              253,
              color: TeamShareTokens.inkGhost,
              em: -0.07,
              height: 0.8,
            ),
          ),
        ),
      ],
    );
  }
}

/// O card escuro de baixo do estilo ranking: números, últimas etapas e a
/// linha final ([footer]: elenco ou sequência + link).
class TeamShareDarkPanel extends StatelessWidget {
  const TeamShareDarkPanel({
    super.key,
    required this.data,
    required this.footerLeading,
  });

  final TeamShareCardData data;
  final Widget footerLeading;

  @override
  Widget build(BuildContext context) {
    const divider = SizedBox(
      height: 0.5,
      child: ColoredBox(color: TeamShareTokens.line),
    );
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TeamShareTokens.ink,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            color: Color(0x59000000),
            blurRadius: 27,
            offset: Offset(0, 13),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TeamShareStat(
                  label: 'PONTOS',
                  value: teamShareThousands(data.points),
                  size: 21.3,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TeamShareStat(
                  label: 'APROV.',
                  value: '${data.winRatePercent}',
                  suffix: '%',
                  size: 21.3,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TeamShareStat(
                  label: 'TÍTULOS',
                  value: '${data.titles}',
                  size: 21.3,
                ),
              ),
            ],
          ),
          if (data.stages.isNotEmpty) ...[
            const SizedBox(height: 13),
            divider,
            const SizedBox(height: 13),
            TeamShareStages(stages: data.stages),
          ],
          const SizedBox(height: 13),
          divider,
          const SizedBox(height: 13),
          Row(
            children: [
              footerLeading,
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      data.followLabel,
                      textScaler: TextScaler.noScaling,
                      style: TeamShareTokens.label(6.3, em: 0.08),
                    ),
                    const SizedBox(height: 1.3),
                    Text(
                      data.linkLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textScaler: TextScaler.noScaling,
                      style: TeamShareTokens.display(
                        9.3,
                        em: -0.02,
                        height: 1.2,
                        weight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
