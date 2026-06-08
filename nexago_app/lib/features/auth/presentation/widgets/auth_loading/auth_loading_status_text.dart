import 'package:flutter/material.dart';

import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

const _statusMessages = <String>[
  'PREPARANDO SUA QUADRA',
  'CARREGANDO RANKING • GO',
  'TUDO PRONTO • BORA JOGAR',
];

class AuthLoadingStatusText extends StatefulWidget {
  const AuthLoadingStatusText({super.key});

  @override
  State<AuthLoadingStatusText> createState() => _AuthLoadingStatusTextState();
}

class _AuthLoadingStatusTextState extends State<AuthLoadingStatusText> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _cycle();
  }

  Future<void> _cycle() async {
    while (mounted) {
      await Future<void>.delayed(const Duration(milliseconds: 1600));
      if (!mounted) return;
      setState(() => _index = (_index + 1) % _statusMessages.length);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted.withValues(alpha: 0.88);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 520),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, animation) {
        final slide =
            Tween<Offset>(
              begin: const Offset(0, 0.22),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            );
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: slide, child: child),
        );
      },
      child: Text(
        _statusMessages[_index],
        key: ValueKey<int>(_index),
        textAlign: TextAlign.center,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: muted,
          letterSpacing: 0.55,
          height: 1.35,
        ),
      ),
    );
  }
}
