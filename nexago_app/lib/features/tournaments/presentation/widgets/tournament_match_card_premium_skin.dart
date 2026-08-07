import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/tournament_match_card_row.dart';

/// Ouro da final e bronze do 3º lugar — porte do card premium da Copa VH.
const Color kMatchCardGold = Color(0xFFF2C14E);
const Color kMatchCardBronze = Color(0xFFD08A5A);

/// Casca do card de partida: fundo, borda, brilho e o tratamento premium da
/// final e do 3º lugar (respiro + varredura), que no portal são as animações
/// `mt-gold-breathe` / `mt-shimmer-sweep`.
///
/// Ambas as animações somem com "reduzir movimento" ligado no sistema: o card
/// continua ouro/bronze, só para de respirar.
class TournamentMatchCardSkin extends StatefulWidget {
  const TournamentMatchCardSkin({
    super.key,
    required this.stage,
    required this.isLive,
    required this.isMine,
    required this.child,
    this.onTap,
  });

  final TournamentMatchRowStage? stage;
  final bool isLive;
  final bool isMine;
  final Widget child;
  final VoidCallback? onTap;

  @override
  State<TournamentMatchCardSkin> createState() =>
      _TournamentMatchCardSkinState();
}

class _TournamentMatchCardSkinState extends State<TournamentMatchCardSkin>
    with TickerProviderStateMixin {
  static const _radius = 16.0;

  AnimationController? _breathe;
  AnimationController? _shimmer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncControllers();
  }

  @override
  void didUpdateWidget(TournamentMatchCardSkin oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.stage != widget.stage) _syncControllers();
  }

  void _syncControllers() {
    final animate =
        widget.stage != null && !MediaQuery.disableAnimationsOf(context);
    if (animate == (_breathe != null)) return;

    if (animate) {
      _breathe = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1800),
      )..repeat(reverse: true);
      _shimmer = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 4600),
      )..repeat();
    } else {
      _breathe?.dispose();
      _shimmer?.dispose();
      _breathe = null;
      _shimmer = null;
    }
  }

  @override
  void dispose() {
    _breathe?.dispose();
    _shimmer?.dispose();
    super.dispose();
  }

  Color get _accent => widget.stage == TournamentMatchRowStage.thirdPlace
      ? kMatchCardBronze
      : kMatchCardGold;

  Color _borderColor(BuildContext context) {
    return switch (widget.stage) {
      TournamentMatchRowStage.grandFinal =>
        kMatchCardGold.withValues(alpha: 0.55),
      TournamentMatchRowStage.thirdPlace =>
        kMatchCardBronze.withValues(alpha: 0.5),
      null when widget.isLive => AppColors.brand.withValues(alpha: 0.4),
      null when widget.isMine => AppColors.brand.withValues(alpha: 0.35),
      null => context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    };
  }

  /// Ao vivo brilha em laranja; final e 3º lugar respiram no próprio metal.
  List<BoxShadow> _shadows(double breath) {
    if (widget.stage != null) {
      return [
        BoxShadow(
          color: _accent.withValues(alpha: 0.22 + 0.23 * breath),
          spreadRadius: 1,
        ),
        BoxShadow(
          color: _accent.withValues(alpha: 0.10 + 0.20 * breath),
          blurRadius: 28 + 18 * breath,
          offset: Offset(0, 8 + 2 * breath),
        ),
      ];
    }
    if (widget.isLive) {
      return [
        BoxShadow(
          color: AppColors.brand.withValues(alpha: 0.3),
          spreadRadius: 1,
        ),
        BoxShadow(
          color: AppColors.brand.withValues(alpha: 0.25),
          blurRadius: 40,
          offset: const Offset(0, 12),
        ),
      ];
    }
    return const [];
  }

  @override
  Widget build(BuildContext context) {
    final surface = context.themeColors.surfaceCard;
    final border = _borderColor(context);

    Widget card(double breath) {
      return Container(
        margin: const EdgeInsets.fromLTRB(20, 0, 20, 14),
        decoration: BoxDecoration(
          color: widget.stage == null ? surface : null,
          gradient: widget.stage != null
              ? LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color.alphaBlend(
                      _accent.withValues(alpha: 0.08),
                      surface,
                    ),
                    surface,
                  ],
                  stops: const [0, 0.58],
                )
              : null,
          borderRadius: BorderRadius.circular(_radius),
          border: Border.all(color: border),
          boxShadow: _shadows(breath),
        ),
        clipBehavior: Clip.antiAlias,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onTap,
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: widget.child,
                ),
                if (_shimmer != null)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: _Shimmer(
                        animation: _shimmer!,
                        color:
                            widget.stage == TournamentMatchRowStage.thirdPlace
                                ? const Color(0xFFF3C9A8)
                                : const Color(0xFFFFE9A8),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    final breathe = _breathe;
    if (breathe == null) return card(0);

    return AnimatedBuilder(
      animation: breathe,
      builder: (_, _) => card(Curves.easeInOut.transform(breathe.value)),
    );
  }
}

/// Faixa de luz que atravessa o card uma vez a cada ciclo e descansa o resto —
/// a varredura só ocupa os primeiros 60% do tempo, como no portal.
class _Shimmer extends StatelessWidget {
  const _Shimmer({required this.animation, required this.color});

  final Animation<double> animation;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (_, _) {
        final t = Curves.easeInOut.transform(
          (animation.value / 0.6).clamp(0.0, 1.0),
        );
        final dx = 2.2 - 3.4 * t;
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment(dx - 0.8, -1),
              end: Alignment(dx + 0.8, 1),
              colors: [
                color.withValues(alpha: 0),
                color.withValues(alpha: 0.16),
                color.withValues(alpha: 0),
              ],
              stops: const [0.35, 0.5, 0.65],
            ),
          ),
        );
      },
    );
  }
}
