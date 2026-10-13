import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

/// Uma dupla na mesa "bloco de saque" (metade da tela inteira tocável).
class LiveTableMesaTeam {
  const LiveTableMesaTeam({
    required this.label,
    required this.score,
    required this.isServing,
    required this.onTap,
    required this.onMinus,
    this.servingPlayerName,
    this.onTapServingPlayer,
  });

  final String label;

  /// Número (ou rótulo de game: 0/15/30/40/AD) já formatado.
  final String score;
  final bool isServing;
  final VoidCallback onTap;
  final VoidCallback onMinus;

  /// Atleta no saque — só vale quando [isServing].
  final String? servingPlayerName;
  final VoidCallback? onTapServingPlayer;
}

/// O que a rede (faixa entre as metades) mostra. Prioridade: fim do set, set
/// point, troca no próximo ponto, contador de troca.
class LiveTableMesaNet {
  const LiveTableMesaNet({
    this.finishText,
    this.setPointText,
    this.interval,
    this.total = 0,
  });

  final String? finishText;
  final String? setPointText;

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
  });

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
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _TeamHalf(
                team: screen.top,
                sideLabel: 'LADO A',
                enabled: pointsEnabled,
                radius: 26,
                fontSize: 150,
              ),
            ),
          ),
          _NetRow(net: screen.net),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _TeamHalf(
                team: screen.bottom,
                sideLabel: 'LADO B',
                enabled: pointsEnabled,
                radius: 26,
                fontSize: 150,
              ),
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
                          color: AppColors.live,
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
    return Tooltip(
      message: tooltip ?? '',
      child: Material(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
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
    this.showSideLabel = true,
    this.minusAtTop = false,
    this.minusOnLeft = false,
  });

  final LiveTableMesaTeam team;
  final String sideLabel;
  final bool enabled;
  final double radius;
  final double fontSize;
  final bool showSideLabel;

  /// Landscape: o "−" sobe pro canto superior, do lado de fora.
  final bool minusAtTop;
  final bool minusOnLeft;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final serving = team.isServing;
    final fg = serving ? _nxInk : colors.onSurface;
    final muted =
        serving ? _nxInk.withValues(alpha: 0.6) : colors.onSurfaceMuted;
    final minus = Positioned(
      right: minusOnLeft ? null : 14,
      left: minusOnLeft ? 14 : null,
      top: minusAtTop ? 14 : null,
      bottom: minusAtTop ? null : 14,
      child: _MinusButton(
        onPressed: team.onMinus,
        enabled: enabled,
        serving: serving,
      ),
    );

    return Semantics(
      button: true,
      label: 'Ponto para ${team.label}. Placar ${team.score}. '
          '${serving ? 'Sacando' : 'Recebendo'}',
      excludeSemantics: true,
      onTap: enabled ? team.onTap : null,
      child: Material(
        color: serving ? AppColors.brand : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: serving
              ? BorderSide.none
              : BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.18)),
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
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            team.label,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: fg,
                              height: 1.2,
                            ),
                          ),
                        ),
                        if (showSideLabel)
                          Padding(
                            padding: const EdgeInsets.only(left: 8, top: 3),
                            child: Text(
                              sideLabel,
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
                        alignment: Alignment.centerLeft,
                        child: serving
                            ? _ServePill(
                                name: team.servingPlayerName,
                                onTap: enabled ? team.onTapServingPlayer : null,
                              )
                            : Text(
                                'recebendo · toque = +1',
                                style: AppTypography.mono(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: muted,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
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
  late final Animation<double> _scale = Tween<double>(begin: 1.12, end: 1)
      .animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutBack));

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
    final fg = serving ? _nxInk : colors.onSurface;
    return Semantics(
      button: true,
      label: 'Remover último ponto desta dupla',
      excludeSemantics: true,
      child: Material(
        color: serving ? _nxInk.withValues(alpha: 0.18) : colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: serving
              ? BorderSide.none
              : BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.2)),
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

class _ServePill extends StatelessWidget {
  const _ServePill({required this.name, required this.onTap});

  final String? name;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final trimmed = name?.trim() ?? '';
    final initial =
        trimmed.isEmpty ? '?' : trimmed.characters.first.toUpperCase();
    final text = trimmed.isEmpty
        ? (onTap != null ? 'Saque · escolher atleta' : 'Saque')
        : 'Saque · $trimmed';
    return Material(
      color: _nxInk,
      shape: const StadiumBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 18, 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.brand,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  initial,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: _nxInk,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
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
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: _NetContent(net: net),
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
    TextStyle style(Color color) => AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 1,
        );
    if (net.finishText != null) {
      return Text(net.finishText!, style: style(AppColors.win));
    }
    if (net.setPointText != null) {
      return Text(net.setPointText!, style: style(AppColors.brandHover));
    }
    final interval = net.interval;
    if (interval == null) return const SizedBox.shrink();
    if (net.switchNext) {
      return Text('⇄ TROCA NO PRÓXIMO PONTO', style: style(AppColors.pending));
    }
    final filled = net.total % interval;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '⇄ TROCA EM ${net.untilSwitch} ·',
          style: style(context.themeColors.onSurfaceMuted),
        ),
        const SizedBox(width: 8),
        for (var i = 0; i < interval; i++)
          Container(
            width: 18,
            height: 6,
            margin: EdgeInsets.only(left: i == 0 ? 0 : 3),
            decoration: BoxDecoration(
              color: i < filled ? AppColors.pending : _nxMarkEmpty,
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
      painter: _DashPainter(vertical: vertical),
      child: const SizedBox.expand(),
    );
  }
}

class _DashPainter extends CustomPainter {
  _DashPainter({required this.vertical});

  final bool vertical;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = _nxLineStrong
      ..strokeWidth = 1.5;
    final length = vertical ? size.height : size.width;
    for (double d = 0; d < length; d += 10) {
      final end = (d + 6).clamp(0, length).toDouble();
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
  bool shouldRepaint(covariant _DashPainter old) => old.vertical != vertical;
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
    final color = onPressed == null
        ? colors.onSurface.withValues(alpha: 0.4)
        : colors.onSurface;
    return Semantics(
      button: true,
      label: label ?? 'Mais opções',
      excludeSemantics: true,
      child: Material(
        color: colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side:
              BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.18)),
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
    final net = screen.net;
    final court = screen.courtLabel.trim();
    final headerText = [
      if (court.isNotEmpty) court,
      if (screen.setLabel != null) screen.setLabel!,
      screen.elapsedLabel,
    ].join(' · ');
    final status = net.finishText ?? net.setPointText;
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
                showSideLabel: false,
                minusAtTop: true,
                minusOnLeft: true,
              ),
            ),
            SizedBox(
              width: 64,
              child: SafeArea(
                left: false,
                right: false,
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    _SquareIconButton(
                      icon: Icons.undo_rounded,
                      tooltip: 'Desfazer',
                      size: 40,
                      onPressed: pointsEnabled ? screen.onUndo : () {},
                    ),
                    const Expanded(child: _Dashes(vertical: true)),
                    if (until != null)
                      Container(
                        width: 48,
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: net.switchNext
                                ? AppColors.pending
                                : _nxLineStrong,
                            width: 2,
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
                    const Expanded(child: _Dashes(vertical: true)),
                    _SquareIconButton(
                      icon: Icons.more_horiz_rounded,
                      tooltip: 'Mais opções',
                      size: 40,
                      onPressed: screen.onMore,
                    ),
                    const SizedBox(height: 12),
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
                showSideLabel: false,
                minusAtTop: true,
              ),
            ),
          ],
        ),
        Positioned(
          top: 8,
          left: 0,
          right: 0,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 76),
              child: Row(
                children: [
                  _SquareIconButton(
                    icon: Icons.chevron_left_rounded,
                    tooltip: 'Voltar',
                    size: 40,
                    onPressed: screen.onBack,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    headerText,
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppColors.live,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const Spacer(),
                  if (status != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: _nxInk.withValues(alpha: 0.7),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        status,
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: net.finishText != null
                              ? AppColors.win
                              : AppColors.brandHover,
                          letterSpacing: 0.8,
                        ),
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
    return BackdropFilter(
      filter: ui.ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: ColoredBox(
        color: const Color(0xD1050505),
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
                      border: Border.all(
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
                            color: AppColors.pending,
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
                                label: info.topLabel,
                                direction: 'esquerda → direita',
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 10),
                              child: Icon(
                                Icons.swap_horiz_rounded,
                                color: AppColors.pending,
                              ),
                            ),
                            Expanded(
                              child: _SwitchTeam(
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
                            backgroundColor: AppColors.pending,
                            foregroundColor: _nxInk,
                            minimumSize: const Size.fromHeight(60),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
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
                            side: BorderSide(
                              color:
                                  colors.onSurfaceMuted.withValues(alpha: 0.3),
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
      ),
    );
  }
}

class _SwitchTeam extends StatelessWidget {
  const _SwitchTeam({required this.label, required this.direction});

  final String label;
  final String direction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border:
            Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.18)),
      ),
      child: Column(
        children: [
          Text(
            label,
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
