import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';

/// Ponto pulsante do "ao vivo" (porte de `nx-live-pulse` do portal). Para de
/// pulsar com "reduzir movimento" ligado no sistema.
class TournamentMatchCardLiveDot extends StatefulWidget {
  const TournamentMatchCardLiveDot({
    super.key,
    this.color = AppColors.live,
    this.size = 6,
  });

  final Color color;
  final double size;

  @override
  State<TournamentMatchCardLiveDot> createState() =>
      _TournamentMatchCardLiveDotState();
}

class _TournamentMatchCardLiveDotState extends State<TournamentMatchCardLiveDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
      _controller.value = 0;
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
    );

    return FadeTransition(
      opacity: Tween<double>(
        begin: 1,
        end: 0.35,
      ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut)),
      child: dot,
    );
  }
}

/// Badge pill «AO VIVO» para partidas em andamento.
class TournamentMatchLiveBadge extends StatelessWidget {
  const TournamentMatchLiveBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.live,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.white,
              shape: BoxShape.circle,
            ),
          ),
          SizedBox(width: 6),
          Text(
            'AO VIVO',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: AppColors.white,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Badge pill «FINALIZADO» para partidas encerradas.
class TournamentMatchFinalizedBadge extends StatelessWidget {
  const TournamentMatchFinalizedBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.win,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        'FINALIZADO',
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
