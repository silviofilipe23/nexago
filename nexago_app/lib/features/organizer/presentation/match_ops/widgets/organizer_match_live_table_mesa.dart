import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../../tournaments/domain/tournament_match_kit_color.dart';
import '../mesa_sun/mesa_sun.dart';
import 'organizer_match_kit_color_widgets.dart';

/// Uma dupla na mesa "bloco de saque" (metade da tela inteira tocável).
class LiveTableMesaTeam {
  const LiveTableMesaTeam({
    required this.label,
    required this.score,
    required this.isServing,
    required this.onTap,
    required this.onMinus,
    this.servingPlayerName,
    this.servingPlayerPhotoUrl,
    this.onTapServingPlayer,
    this.kit,
  });

  final String label;

  /// Número (ou rótulo de game: 0/15/30/40/AD) já formatado.
  final String score;
  final bool isServing;
  final VoidCallback onTap;
  final VoidCallback onMinus;

  /// Atleta no saque — só vale quando [isServing].
  final String? servingPlayerName;

  /// Foto do atleta no saque — sem ela o pill mostra a inicial.
  final String? servingPlayerPhotoUrl;
  final VoidCallback? onTapServingPlayer;

  /// Cor da camisa da dupla: faixa de 8px no topo, quadradinho no nome e o rótulo escrito.
  final KitColor? kit;
}

/// O que a rede (faixa entre as metades) mostra. Prioridade: fim do set, set
/// point, troca no próximo ponto, contador de troca.
class LiveTableMesaNet {
  const LiveTableMesaNet({
    this.finishTeam,
    this.setPointTeam,
    this.finished = false,
    this.interval,
    this.total = 0,
    this.finishKit,
    this.setPointKit,
  });

  /// Partida encerrada ([finishTeam] = vencedor, se houver).
  final bool finished;
  final String? finishTeam;

  /// Dupla que está em set point.
  final String? setPointTeam;

  /// Cor da camisa de quem aparece no aviso (quadradinho antes do nome).
  final KitColor? finishKit;
  final KitColor? setPointKit;

  String? get finishText => !finished
      ? null
      : 'FIM DO JOGO${finishTeam == null ? '' : ' · ${finishTeam!.toUpperCase()}'}';
  String? get setPointText => setPointTeam == null
      ? null
      : 'SET POINT · ${setPointTeam!.toUpperCase()}';

  /// Pontos somados entre trocas de quadra; `null` = a regra não existe no esporte.
  final int? interval;
  final int total;

  int? get untilSwitch {
    final i = interval;
    if (i == null) return null;
    return i - (total % i);
  }

  bool get switchNext => untilSwitch == 1;
}

/// Troca de lado pendente: o ponto que a disparou já foi lançado, mas a mesa
/// ainda não confirmou que as duplas trocaram.
class LiveTableMesaSwitchPending {
  const LiveTableMesaSwitchPending({
    required this.total,
    required this.number,
    required this.topLabel,
    required this.bottomLabel,
    required this.onConfirm,
    required this.onUndo,
    this.topKit,
    this.bottomKit,
  });

  final KitColor? topKit;
  final KitColor? bottomKit;
  final int total;
  final int number;
  final String topLabel;
  final String bottomLabel;
  final VoidCallback onConfirm;
  final VoidCallback onUndo;
}

const _nxLineStrong = Color(0xFF3A3A42);
const _nxMarkEmpty = Color(0xFF2E2E34);
const _nxInk = Color(0xFF0A0A0A);

class LiveTableMesaScreen extends StatelessWidget {
  const LiveTableMesaScreen({
    super.key,
    required this.courtLabel,
    required this.titleLabel,
    required this.elapsedLabel,
    required this.top,
    required this.bottom,
    required this.net,
    required this.enabled,
    required this.onBack,
    required this.onMore,
    required this.onUndo,
    required this.onTimeout,
    this.setLabel,
    this.onValidate,
    this.switchPending,
    this.overlays = const [],
  });

  final String courtLabel;
  final String titleLabel;
  final String elapsedLabel;

  /// "SET 2" — só quando a partida tem mais de um set.
  final String? setLabel;
  final LiveTableMesaTeam top;
  final LiveTableMesaTeam bottom;
  final LiveTableMesaNet net;

  /// `false` bloqueia qualquer toque de ponto (troca pendente, set encerrado, salvando…).
  final bool enabled;
  final VoidCallback onBack;
  final VoidCallback onMore;
  final VoidCallback onUndo;
  final VoidCallback onTimeout;

  /// Partida encerrada: a barra de ações vira o CTA de validar.
  final VoidCallback? onValidate;
  final LiveTableMesaSwitchPending? switchPending;

  /// Camadas por cima da mesa (seletor de saque, tempo técnico…), em ordem.
  final List<Widget> overlays;

  @override
  Widget build(BuildContext context) {
    final landscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;
    final pointsEnabled = enabled && switchPending == null;
    return ColoredBox(
      color: context.themeColors.canvas,
      child: Stack(
        children: [
          landscape
              ? _Landscape(screen: this, pointsEnabled: pointsEnabled)
              : _Portrait(screen: this, pointsEnabled: pointsEnabled),
          for (final overlay in overlays) Positioned.fill(child: overlay),
          if (switchPending != null)
            Positioned.fill(
              child: _SwitchDialog(info: switchPending!, landscape: landscape),
            ),
        ],
      ),
    );
  }
}

class _Portrait extends StatelessWidget {
  const _Portrait({required this.screen, required this.pointsEnabled});

  final LiveTableMesaScreen screen;
  final bool pointsEnabled;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _PortraitHeader(screen: screen),
          Expanded(
            child: _TeamHalf(
              team: screen.top,
              sideLabel: 'LADO A',
              enabled: pointsEnabled,
              radius: 0,
              fontSize: 150,
            ),
          ),
          _NetRow(net: screen.net),
          Expanded(
            child: _TeamHalf(
              team: screen.bottom,
              sideLabel: 'LADO B',
              enabled: pointsEnabled,
              radius: 0,
              fontSize: 150,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: screen.onValidate != null
                ? _ValidateButton(onPressed: screen.onValidate!)
                : _ActionBar(screen: screen),
          ),
        ],
      ),
    );
  }
}

class _PortraitHeader extends StatelessWidget {
  const _PortraitHeader({required this.screen});

  final LiveTableMesaScreen screen;

  @override
  Widget build(BuildContext context) {
    final court = screen.courtLabel.trim();
    final parts = [
      'AO VIVO',
      if (court.isNotEmpty) court,
      if (screen.setLabel != null) screen.setLabel!,
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Row(
        children: [
          _SquareIconButton(
            icon: Icons.chevron_left_rounded,
            tooltip: 'Voltar',
            onPressed: screen.onBack,
          ),
          Expanded(
            child: Column(
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '● ${parts.join(' · ')} · ',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: MesaSun.isOn(context)
                              ? MesaSun.live
                              : context.themeColors.live,
                          letterSpacing: 0.8,
                        ),
                      ),
                      TextSpan(
                        text: screen.elapsedLabel,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ],
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 2),
                Text(
                  screen.titleLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          _SquareIconButton(
            icon: Icons.more_horiz_rounded,
            tooltip: 'Mais opções',
            onPressed: screen.onMore,
          ),
        ],
      ),
    );
  }
}

class _SquareIconButton extends StatelessWidget {
  const _SquareIconButton({
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.size = 44,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sun = MesaSun.isOn(context);
    return Tooltip(
      message: tooltip ?? '',
      child: Material(
        color: sun ? MesaSun.white : colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: sun
              ? const BorderSide(color: MesaSun.ink, width: 2)
              : BorderSide.none,
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(icon, color: colors.onSurface, size: 22),
          ),
        ),
      ),
    );
  }
}

/// Metade da tela de uma dupla: o toque em qualquer ponto = +1.
class _TeamHalf extends StatelessWidget {
  const _TeamHalf({
    required this.team,
    required this.sideLabel,
    required this.enabled,
    required this.radius,
    required this.fontSize,
    this.landscape = false,
    this.minusOnLeft = false,
  });

  final LiveTableMesaTeam team;
  final String sideLabel;
  final bool enabled;
  final double radius;
  final double fontSize;

  /// Paisagem: tela inteira como área de toque — nome e rodapé centralizados, abaixo do
  /// header flutuante, e o "−" no canto superior do lado de FORA ([minusOnLeft]).
  final bool landscape;
  final bool minusOnLeft;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final serving = team.isServing;
    final sun = MesaSun.isOn(context);
    final fg = serving || sun ? (sun ? MesaSun.ink : _nxInk) : colors.onSurface;
    final muted = sun
        ? MesaSun.ink
        : (serving ? _nxInk.withValues(alpha: 0.6) : colors.onSurfaceMuted);
    final minus = Positioned(
      right: minusOnLeft ? null : 14,
      left: minusOnLeft ? 14 : null,
      top: landscape ? 56 : null,
      bottom: landscape ? null : 14,
      child: _MinusButton(
        onPressed: team.onMinus,
        enabled: enabled,
        serving: serving,
      ),
    );

    return Semantics(
      button: true,
      label:
          'Ponto para ${team.label}. Placar ${team.score}. '
          '${serving ? 'Sacando' : 'Recebendo'}',
      excludeSemantics: true,
      onTap: enabled ? team.onTap : null,
      child: Material(
        color: serving ? AppColors.brand : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: sun
              ? const BorderSide(color: MesaSun.ink, width: 3)
              : (serving
                    ? BorderSide.none
                    : BorderSide(
                        color: colors.onSurfaceMuted.withValues(alpha: 0.18),
                      )),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled
              ? () {
                  HapticFeedback.lightImpact();
                  team.onTap();
                }
              : null,
          child: Stack(
            children: [
              Padding(
                padding: landscape
                    ? const EdgeInsets.fromLTRB(110, 70, 110, 14)
                    : const EdgeInsets.fromLTRB(20, 16, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              children: [
                                if (team.kit != null)
                                  kitSquareSpan(team.kit!, 16),
                                TextSpan(text: team.label),
                              ],
                            ),
                            maxLines: 2,
                            textAlign: landscape
                                ? TextAlign.center
                                : TextAlign.start,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: fg,
                              height: 1.2,
                            ),
                          ),
                        ),
                        if (!landscape)
                          Padding(
                            padding: const EdgeInsets.only(left: 8, top: 3),
                            child: Text(
                              team.kit == null
                                  ? sideLabel
                                  : '$sideLabel · CAMISA ${team.kit!.label.toUpperCase()}',
                              style: AppTypography.mono(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: muted,
                                letterSpacing: 1,
                              ),
                            ),
                          ),
                      ],
                    ),
                    // Paisagem não tem o rótulo do lado: o nome da cor fica por escrito aqui
                    // (a cor nunca pode ser só visual — daltonismo).
                    if (landscape && team.kit != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          'CAMISA ${team.kit!.label.toUpperCase()}',
                          textAlign: TextAlign.center,
                          style: AppTypography.mono(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: muted,
                            letterSpacing: 1,
                          ),
                        ),
                      ),
                    Expanded(
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: _ScorePop(
                            value: team.score,
                            style: AppTypography.mono(
                              fontSize: fontSize,
                              fontWeight: FontWeight.w800,
                              color: fg,
                              letterSpacing: -fontSize * 0.05,
                              height: 1,
                            ),
                          ),
                        ),
                      ),
                    ),
                    // Reserva a altura do rodapé (pill 44 / botão "−" 52).
                    SizedBox(
                      height: 52,
                      child: Align(
                        alignment: landscape
                            ? Alignment.center
                            : Alignment.centerLeft,
                        child: serving
                            ? _ServePill(
                                name: team.servingPlayerName,
                                photoUrl: team.servingPlayerPhotoUrl,
                                onTap: enabled ? team.onTapServingPlayer : null,
                              )
                            : Text(
                                'recebendo · toque = +1',
                                style: AppTypography.mono(
                                  fontSize: 12,
                                  fontWeight: sun
                                      ? FontWeight.w600
                                      : FontWeight.w500,
                                  color: muted,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
              // Faixa da camisa por cima do laranja do saque: o saque segue sendo o destaque,
              // a faixa só identifica a dupla.
              if (team.kit != null)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: KitStrip(color: team.kit!),
                ),
              minus,
            ],
          ),
        ),
      ),
    );
  }
}

/// Número com "pop" (1.12 → 1) a cada mudança de valor.
class _ScorePop extends StatefulWidget {
  const _ScorePop({required this.value, required this.style});

  final String value;
  final TextStyle style;

  @override
  State<_ScorePop> createState() => _ScorePopState();
}

class _ScorePopState extends State<_ScorePop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
    value: 1,
  );
  late final Animation<double> _scale = Tween<double>(
    begin: 1.12,
    end: 1,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutBack));

  @override
  void didUpdateWidget(covariant _ScorePop oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) _controller.forward(from: 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Text(
        widget.value,
        style: widget.style,
        // Dígitos tabulares: o "1" não encolhe o placar.
      ),
    );
  }
}

class _MinusButton extends StatelessWidget {
  const _MinusButton({
    required this.onPressed,
    required this.enabled,
    required this.serving,
  });

  final VoidCallback onPressed;
  final bool enabled;
  final bool serving;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sun = MesaSun.isOn(context);
    final fg = sun ? MesaSun.ink : (serving ? _nxInk : colors.onSurface);
    return Semantics(
      button: true,
      label: 'Remover último ponto desta dupla',
      excludeSemantics: true,
      child: Material(
        color: sun
            ? MesaSun.white
            : (serving ? _nxInk.withValues(alpha: 0.18) : colors.surfaceRaised),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: sun
              ? const BorderSide(color: MesaSun.ink, width: 2)
              : (serving
                    ? BorderSide.none
                    : BorderSide(
                        color: colors.onSurfaceMuted.withValues(alpha: 0.2),
                      )),
        ),
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            width: 52,
            height: 52,
            child: Icon(Icons.remove_rounded, color: fg, size: 26),
          ),
        ),
      ),
    );
  }
}

/// Avatar do pill de saque. Com foto, o toque amplia (e não troca o sacador); sem foto o
/// toque cai no pill, como antes.
class _ServePillAvatar extends StatelessWidget {
  const _ServePillAvatar({required this.initial, required this.photoUrl});

  static const double size = 32;

  final String initial;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final url = photoUrl?.trim() ?? '';
    final avatar = AthleteProfileAvatar(
      size: size,
      initials: initial,
      imageUrl: url.isEmpty ? null : url,
    );
    if (url.isEmpty) return avatar;
    // O meio da tela já é um Semantics que esconde os filhos, então não há rótulo próprio aqui.
    return GestureDetector(
      key: const ValueKey('serve-pill-avatar-zoom'),
      behavior: HitTestBehavior.opaque,
      onTap: () => openProfilePhotoViewer(context, photoUrls: [url]),
      child: avatar,
    );
  }
}

class _ServePill extends StatelessWidget {
  const _ServePill({required this.name, required this.onTap, this.photoUrl});

  final String? name;
  final String? photoUrl;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final trimmed = name?.trim() ?? '';
    final initial = trimmed.isEmpty
        ? '?'
        : trimmed.characters.first.toUpperCase();
    final text = trimmed.isEmpty
        ? (onTap != null ? 'Saque · escolher atleta' : 'Saque')
        : 'Saque · $trimmed';
    return Material(
      color: MesaSun.isOn(context) ? MesaSun.ink : _nxInk,
      shape: const StadiumBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(6, 6, 18, 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ServePillAvatar(initial: initial, photoUrl: photoUrl),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: MesaSun.isOn(context) ? 15 : 14,
                    fontWeight: FontWeight.w700,
                    color: MesaSun.isOn(context)
                        ? MesaSun.white
                        : AppColors.brand,
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

/// Texto da rede + marcas; usado na horizontal (portrait).
class _NetRow extends StatelessWidget {
  const _NetRow({required this.net});

  final LiveTableMesaNet net;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            const Expanded(child: _Dashes()),
            Flexible(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                // O aviso com nome de dupla + quadradinho pode passar da largura: encolhe, não estoura.
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: _NetContent(net: net),
                ),
              ),
            ),
            const Expanded(child: _Dashes()),
          ],
        ),
      ),
    );
  }
}

class _NetContent extends StatelessWidget {
  const _NetContent({required this.net});

  final LiveTableMesaNet net;

  @override
  Widget build(BuildContext context) {
    final sun = MesaSun.isOn(context);
    // Sol: tudo preto e mais pesado — o texto da rede não depende de cor pra ser lido.
    TextStyle style(Color color) => AppTypography.mono(
      fontSize: 13,
      fontWeight: sun ? FontWeight.w800 : FontWeight.w700,
      color: sun ? MesaSun.ink : color,
      letterSpacing: 1,
    );
    // Sol: o estado vira chip sólido com borda preta (laranja, verde, amarelo).
    Widget chip(String text, Color fill, Color fallbackText, [KitColor? kit]) {
      final text0 = Text(text, style: style(fallbackText));
      // O nome sempre vem com o quadradinho da camisa.
      final label = kit == null
          ? text0
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                KitSquare(color: kit, fontSize: 13),
                const SizedBox(width: 6),
                text0,
              ],
            );
      if (!sun) return label;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: MesaSun.ink, width: 2),
        ),
        child: label,
      );
    }

    if (net.finishText != null) {
      return chip(
        net.finishText!,
        MesaSun.winFill,
        context.themeColors.win,
        net.finishKit,
      );
    }
    if (net.setPointText != null) {
      return chip(
        net.setPointText!,
        MesaSun.orange,
        AppColors.brandHover,
        net.setPointKit,
      );
    }
    final interval = net.interval;
    if (interval == null) return const SizedBox.shrink();
    if (net.switchNext) {
      return chip(
        '⇄ TROCA NO PRÓXIMO PONTO',
        MesaSun.pendingFill,
        context.themeColors.pending,
      );
    }
    final filled = net.total % interval;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '⇄ TROCA EM ${net.untilSwitch} ·',
          style: AppTypography.mono(fontSize: 35),
        ),
        const SizedBox(width: 8),
        for (var i = 0; i < interval; i++)
          Container(
            width: 18,
            height: sun ? 8 : 6,
            margin: EdgeInsets.only(left: i == 0 ? 0 : 3),
            decoration: BoxDecoration(
              color: sun
                  ? (i < filled ? MesaSun.ink : MesaSun.markEmpty)
                  : (i < filled ? context.themeColors.pending : _nxMarkEmpty),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
      ],
    );
  }
}

class _Dashes extends StatelessWidget {
  const _Dashes({this.vertical = false});

  final bool vertical;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashPainter(vertical: vertical, sun: MesaSun.isOn(context)),
      child: const SizedBox.expand(),
    );
  }
}

class _DashPainter extends CustomPainter {
  _DashPainter({required this.vertical, this.sun = false});

  final bool vertical;

  /// Sol: traço de 3px preto, 8 de traço e 4 de espaço.
  final bool sun;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = sun ? MesaSun.ink : _nxLineStrong
      ..strokeWidth = sun ? 3 : 1.5;
    final length = vertical ? size.height : size.width;
    final dash = sun ? 8.0 : 6.0;
    final step = sun ? 12.0 : 10.0;
    for (double d = 0; d < length; d += step) {
      final end = (d + dash).clamp(0, length).toDouble();
      if (vertical) {
        canvas.drawLine(
          Offset(size.width / 2, d),
          Offset(size.width / 2, end),
          paint,
        );
      } else {
        canvas.drawLine(
          Offset(d, size.height / 2),
          Offset(end, size.height / 2),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashPainter old) =>
      old.vertical != vertical || old.sun != sun;
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.screen});

  final LiveTableMesaScreen screen;

  @override
  Widget build(BuildContext context) {
    final enabled = screen.enabled && screen.switchPending == null;
    return Row(
      children: [
        Expanded(
          flex: 13,
          child: _BarButton(
            icon: Icons.undo_rounded,
            label: 'Desfazer',
            onPressed: enabled ? screen.onUndo : null,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 10,
          child: _BarButton(
            icon: Icons.timer_outlined,
            label: 'Tempo',
            onPressed: enabled ? screen.onTimeout : null,
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 64,
          child: _BarButton(
            icon: Icons.more_horiz_rounded,
            label: null,
            onPressed: screen.onMore,
          ),
        ),
      ],
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.icon, required this.label, this.onPressed});

  final IconData icon;
  final String? label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sun = MesaSun.isOn(context);
    // Sol: desabilitado fica tracejado/claro, mas nunca abaixo de 66% de opacidade.
    final color = onPressed == null
        ? colors.onSurface.withValues(alpha: sun ? 0.66 : 0.4)
        : colors.onSurface;
    return Semantics(
      button: true,
      label: label ?? 'Mais opções',
      excludeSemantics: true,
      child: Material(
        color: colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: sun
              ? const BorderSide(color: MesaSun.ink, width: 2)
              : BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.18),
                ),
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: color, size: 20),
                if (label != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    label!,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ValidateButton extends StatelessWidget {
  const _ValidateButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.black,
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: AppTypography.soraRegular(
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
      ),
      child: const Text('Validar resultado'),
    );
  }
}

class _Landscape extends StatelessWidget {
  const _Landscape({required this.screen, required this.pointsEnabled});

  final LiveTableMesaScreen screen;
  final bool pointsEnabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sun = MesaSun.isOn(context);
    final net = screen.net;
    final court = screen.courtLabel.trim();
    final headerText = [
      if (court.isNotEmpty) court,
      if (screen.setLabel != null) screen.setLabel!,
      screen.elapsedLabel,
    ].join(' · ');
    final finished = net.finished;
    final statusTeam = finished ? net.finishTeam : net.setPointTeam;
    final status = finished
        ? 'Fim do jogo${statusTeam == null ? '' : ' · $statusTeam'}'
        : (net.setPointTeam == null ? null : 'Set point · ${net.setPointTeam}');
    // Pinta a pílula `_nxInk` (escura fixa): fica no cru em qualquer tema.
    final statusColor = finished ? AppColors.win : AppColors.brandHover;
    final statusFill = finished ? MesaSun.winFill : MesaSun.orange;
    final until = net.untilSwitch;

    return Stack(
      children: [
        Row(
          children: [
            Expanded(
              child: _TeamHalf(
                team: screen.top,
                sideLabel: 'LADO A',
                enabled: pointsEnabled,
                radius: 0,
                fontSize: 190,
                landscape: true,
                minusOnLeft: true,
              ),
            ),
            // Rede: coluna escura, linha tracejada vertical e os controles de mesa.
            Container(
              width: 64,
              color: colors.canvas,
              child: SafeArea(
                left: false,
                right: false,
                child: Stack(
                  children: [
                    const Positioned.fill(child: _Dashes(vertical: true)),
                    Column(
                      children: [
                        const SizedBox(height: 40),
                        _SquareIconButton(
                          icon: Icons.undo_rounded,
                          tooltip: 'Desfazer',
                          size: 40,
                          onPressed: pointsEnabled ? screen.onUndo : () {},
                        ),
                        const Spacer(),
                        if (until != null)
                          Container(
                            width: 48,
                            height: 48,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: sun
                                  ? (net.switchNext
                                        ? MesaSun.pendingFill
                                        : MesaSun.white)
                                  : colors.canvas,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: sun
                                    ? MesaSun.ink
                                    : (net.switchNext
                                          ? AppColors.pending
                                          : _nxLineStrong),
                                width: sun ? 3 : 2,
                              ),
                            ),
                            child: Text(
                              '$until',
                              style: AppTypography.mono(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                        if (until != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            '⇄ TROCA',
                            style: AppTypography.mono(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: sun
                                  ? MesaSun.ink
                                  : (net.switchNext
                                        ? colors.pending
                                        : colors.onSurfaceMuted),
                              letterSpacing: 1,
                            ),
                          ),
                        ],
                        const Spacer(),
                        _SquareIconButton(
                          icon: Icons.more_horiz_rounded,
                          tooltip: 'Mais opções',
                          size: 40,
                          onPressed: screen.onMore,
                        ),
                        const SizedBox(height: 12),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: _TeamHalf(
                team: screen.bottom,
                sideLabel: 'LADO B',
                enabled: pointsEnabled,
                radius: 0,
                fontSize: 190,
                landscape: true,
              ),
            ),
          ],
        ),
        // Header flutuante: voltar + relógio à esquerda, set point à direita.
        Positioned(
          top: 12,
          left: 0,
          right: 0,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  _SquareIconButton(
                    icon: Icons.chevron_left_rounded,
                    tooltip: 'Voltar',
                    size: 44,
                    onPressed: screen.onBack,
                  ),
                  const SizedBox(width: 8),
                  Container(
                    height: 32,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: sun ? MesaSun.white : _nxInk,
                      borderRadius: BorderRadius.circular(16),
                      border: sun
                          ? Border.all(color: MesaSun.ink, width: 2)
                          : Border.all(
                              color: AppColors.live.withValues(alpha: 0.5),
                            ),
                    ),
                    // Pílula `_nxInk` (escura fixa): o vermelho fica no cru.
                    child: Text(
                      '● $headerText',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: sun ? MesaSun.live : AppColors.live,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (status != null)
                    Container(
                      height: 32,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: sun ? statusFill : _nxInk,
                        borderRadius: BorderRadius.circular(16),
                        border: sun
                            ? Border.all(color: MesaSun.ink, width: 2)
                            : Border.all(
                                color: statusColor.withValues(alpha: 0.55),
                              ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if ((finished ? net.finishKit : net.setPointKit)
                              case final kit?) ...[
                            KitSquare(color: kit, fontSize: 14),
                            const SizedBox(width: 6),
                          ],
                          Text(
                            status,
                            style: AppTypography.soraRegular(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: sun ? MesaSun.ink : statusColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Modal de troca de lado: bloqueia os pontos até a mesa confirmar.
class _SwitchDialog extends StatelessWidget {
  const _SwitchDialog({required this.info, required this.landscape});

  final LiveTableMesaSwitchPending info;
  final bool landscape;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sun = MesaSun.isOn(context);
    final dialog = ColoredBox(
      // Sol: véu branco a 90%, sem blur.
      color: sun ? const Color(0xE6FFFFFF) : const Color(0xD1050505),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: landscape ? 520 : 400),
              child: Semantics(
                liveRegion: true,
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: colors.surfaceSheet,
                    borderRadius: BorderRadius.circular(28),
                    border: sun
                        ? Border.all(color: MesaSun.ink, width: 3)
                        : Border.all(
                            color: AppColors.pending.withValues(alpha: 0.45),
                          ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '${info.total} PONTOS · TROCA Nº ${info.number}',
                        textAlign: TextAlign.center,
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: sun ? MesaSun.ink : colors.pending,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Trocar de lado',
                        textAlign: TextAlign.center,
                        style: AppTypography.soraRegular(
                          fontSize: landscape ? 24 : 30,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _SwitchTeam(
                              kit: info.topKit,
                              label: info.topLabel,
                              direction: 'esquerda → direita',
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Icon(
                              Icons.swap_horiz_rounded,
                              color: sun ? MesaSun.ink : colors.pending,
                            ),
                          ),
                          Expanded(
                            child: _SwitchTeam(
                              kit: info.bottomKit,
                              label: info.bottomLabel,
                              direction: 'direita → esquerda',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Novos pontos ficam bloqueados até confirmar',
                        textAlign: TextAlign.center,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 14),
                      FilledButton(
                        onPressed: info.onConfirm,
                        style: FilledButton.styleFrom(
                          backgroundColor: sun
                              ? MesaSun.pendingFill
                              : AppColors.pending,
                          foregroundColor: sun ? MesaSun.ink : _nxInk,
                          minimumSize: const Size.fromHeight(60),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                            side: sun
                                ? const BorderSide(color: MesaSun.ink, width: 2)
                                : BorderSide.none,
                          ),
                          textStyle: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        child: const Text('Duplas trocaram de lado'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: info.onUndo,
                        icon: const Icon(Icons.undo_rounded, size: 18),
                        label: const Text('Desfazer último ponto'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: colors.onSurface,
                          minimumSize: const Size.fromHeight(52),
                          side: sun
                              ? const BorderSide(color: MesaSun.ink, width: 2)
                              : BorderSide(
                                  color: colors.onSurfaceMuted.withValues(
                                    alpha: 0.3,
                                  ),
                                ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          textStyle: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    if (sun) return dialog;
    return BackdropFilter(
      filter: ui.ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: dialog,
    );
  }
}

class _SwitchTeam extends StatelessWidget {
  const _SwitchTeam({required this.label, required this.direction, this.kit});

  final KitColor? kit;
  final String label;
  final String direction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sun = MesaSun.isOn(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: sun ? MesaSun.surface : colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: sun
            ? Border.all(color: MesaSun.ink, width: 2)
            : Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.18)),
      ),
      child: Column(
        children: [
          Text.rich(
            TextSpan(
              children: [
                if (kit != null) kitSquareSpan(kit!, 14),
                TextSpan(text: label),
              ],
            ),
            textAlign: TextAlign.center,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            direction,
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
