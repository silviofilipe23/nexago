import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_boot_logic.dart';

/// A soleira do Modo Focus: o que a casca desenha enquanto o dia do atleta
/// carrega.
///
/// O anel é DETERMINADO — ele cresce um terço a cada stream que chega — e ao
/// mesmo tempo gira. Girar sozinho é o girador de sempre, que não informa nada;
/// crescer sozinho pareceria travado nos segundos entre um stream e outro. Os
/// dois juntos são a única peça de ousadia da tela, e o resto fica quieto.
///
/// A lista abaixo do anel nomeia o que falta. Ela não é decoração: cada linha é
/// um passo de [FocusBootProgress], e o visto verde só acende quando aquele
/// dado chega de verdade.
class FocusBootLoader extends StatefulWidget {
  const FocusBootLoader({
    super.key,
    required this.progress,
    this.tournamentName,
  });

  final FocusBootProgress progress;

  /// Nome do torneio, quando já conhecido — ele chega junto com o passo
  /// [FocusBootStep.journey], então nos primeiros quadros costuma ser nulo.
  final String? tournamentName;

  @override
  State<FocusBootLoader> createState() => _FocusBootLoaderState();
}

class _FocusBootLoaderState extends State<FocusBootLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Respeita "reduzir movimento": sem giro o anel continua contando os
    // passos, que é a informação que importa.
    if (MediaQuery.disableAnimationsOf(context)) {
      _spin.stop();
      _spin.value = 0;
    } else if (!_spin.isAnimating) {
      _spin.repeat();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  /// O nome ganha LINHA PRÓPRIA por dois motivos.
  ///
  /// Um: emendado na frase, um nome longo quebra deixando a última palavra
  /// sozinha ("...com a mesa · Open Goiânia / Beach").
  ///
  /// Dois: sem artigo não é preciso adivinhar o gênero do nome do torneio —
  /// "a mesa da Copa" e "a mesa do Open" não têm forma única.
  String get _subtitle {
    final name = widget.tournamentName?.trim();
    if (name == null || name.isEmpty) {
      return 'Sincronizando com a mesa do torneio';
    }
    return 'Sincronizando com a mesa\n$name';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Preparando o Modo Focus',
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Em tela baixa (SE, ou fonte grande do sistema) o bloco inteiro
          // ainda rola, mas rolar esconde justamente a lista — que é a parte
          // que informa. Encolher o anel e o título mantém os três passos
          // visíveis sem cortar nada.
          final compact = constraints.maxHeight < 520;
          final gap = compact ? AppSpacing.xl : AppSpacing.sectionGap;
          final padV = compact ? AppSpacing.lg : AppSpacing.xxl;

          return SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: padV,
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: math.max(0, constraints.maxHeight - padV * 2),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _ProgressRing(
                      spin: _spin,
                      fraction: widget.progress.fraction,
                      compact: compact,
                    ),
                    SizedBox(height: gap),
                    Text(
                      'ENTRANDO NO FOCUS',
                      textAlign: TextAlign.center,
                      style:
                          AppTypography.eyebrow.copyWith(color: AppColors.brand),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      'Preparando o seu\ndia de torneio',
                      textAlign: TextAlign.center,
                      style: (compact
                              ? AppTypography.titleL
                              : AppTypography.displayL)
                          .copyWith(color: colors.onSurface),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      _subtitle,
                      textAlign: TextAlign.center,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyM
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                    SizedBox(height: gap),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 320),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            height: 1,
                            color: colors.onSurfaceMuted.withValues(alpha: 0.16),
                          ),
                          SizedBox(height: compact ? AppSpacing.lg : AppSpacing.xl),
                          for (final step in FocusBootStep.values)
                            _StepRow(
                              step: step,
                              done: widget.progress.isDone(step),
                              spin: _spin,
                              compact: compact,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Anel de 88pt: trilho apagado, arco da marca por cima e a chama no centro —
/// o mesmo ícone da aba "Agora", para onde o atleta está indo.
class _ProgressRing extends StatelessWidget {
  const _ProgressRing({
    required this.spin,
    required this.fraction,
    required this.compact,
  });

  final Animation<double> spin;
  final double fraction;
  final bool compact;

  double get _size => compact ? 68.0 : 88.0;
  double get _stroke => compact ? 5.0 : 6.0;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: fraction),
      duration: AppMotion.slow,
      curve: AppMotion.emphasized,
      builder: (context, value, child) {
        return AnimatedBuilder(
          animation: spin,
          builder: (context, _) {
            return CustomPaint(
              size: Size.square(_size),
              painter: _ArcPainter(
                fraction: value,
                turn: spin.value,
                stroke: _stroke,
                track: AppColors.brand.withValues(alpha: 0.22),
                arc: AppColors.brand,
              ),
              child: child,
            );
          },
        );
      },
      child: SizedBox.square(
        dimension: _size,
        child: Center(
          child: Icon(
            Icons.local_fire_department_rounded,
            color: AppColors.brand,
            size: compact ? 24 : 30,
          ),
        ),
      ),
    );
  }
}

/// Uma linha da lista: marcador à esquerda, rótulo à direita.
///
/// Pendente fica em branco e forte, pronto fica apagado. É o inverso do reflexo
/// de destacar o que já deu certo, e é o que o atleta precisa: o olho vai para
/// o que ainda está chegando.
class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.step,
    required this.done,
    required this.spin,
    required this.compact,
  });

  final FocusBootStep step;
  final bool done;
  final Animation<double> spin;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Semantics(
      label: '${step.label}, ${done ? 'pronto' : 'carregando'}',
      excludeSemantics: true,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: compact ? AppSpacing.md : AppSpacing.lg,
        ),
        child: Row(
          children: [
            _StepMarker(done: done, spin: spin),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AnimatedDefaultTextStyle(
                duration: AppMotion.base,
                curve: AppMotion.curve,
                style: done
                    ? AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted)
                    : AppTypography.bodyM.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                child: Text(step.label),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepMarker extends StatelessWidget {
  const _StepMarker({required this.done, required this.spin});

  final bool done;
  final Animation<double> spin;

  static const double _size = 28;
  static const double _stroke = 2.5;

  @override
  Widget build(BuildContext context) {
    if (done) {
      return Container(
        width: _size,
        height: _size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.win.withValues(alpha: 0.14),
          border: Border.all(color: AppColors.win.withValues(alpha: 0.4)),
        ),
        child: const Icon(Icons.check_rounded, size: 15, color: AppColors.win),
      );
    }

    // Mesmo arco do anel grande, em miniatura: um só idioma visual na tela.
    return AnimatedBuilder(
      animation: spin,
      builder: (context, _) {
        return CustomPaint(
          size: const Size.square(_size),
          painter: _ArcPainter(
            fraction: 0,
            turn: spin.value,
            stroke: _stroke,
            track: AppColors.brand.withValues(alpha: 0.2),
            arc: AppColors.brand,
          ),
        );
      },
    );
  }
}

/// Trilho completo + arco proporcional a [fraction], girado por [turn].
class _ArcPainter extends CustomPainter {
  const _ArcPainter({
    required this.fraction,
    required this.turn,
    required this.stroke,
    required this.track,
    required this.arc,
  });

  final double fraction;

  /// Volta completa em 0..1 — é o que mantém o anel vivo entre um passo e
  /// outro.
  final double turn;

  final double stroke;
  final Color track;
  final Color arc;

  /// Arco mínimo visível: sem ele o primeiro quadro (nenhum passo pronto)
  /// desenharia um anel vazio, que lê como travado.
  static const double _minFraction = 0.12;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      stroke / 2,
      stroke / 2,
      size.width - stroke,
      size.height - stroke,
    );

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = track;
    canvas.drawArc(rect, 0, math.pi * 2, false, base);

    final sweep = math.pi * 2 * math.max(fraction, _minFraction).clamp(0.0, 1.0);
    final head = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = arc;
    canvas.drawArc(rect, -math.pi / 2 + turn * math.pi * 2, sweep, false, head);
  }

  @override
  bool shouldRepaint(_ArcPainter old) =>
      old.fraction != fraction ||
      old.turn != turn ||
      old.stroke != stroke ||
      old.track != track ||
      old.arc != arc;
}
