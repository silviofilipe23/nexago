import 'dart:async';

import 'package:flutter/material.dart';

class FavoriteSuccessPage extends StatefulWidget {
  const FavoriteSuccessPage({
    super.key,
    this.autoCloseDuration = const Duration(milliseconds: 1500),
  });

  final Duration autoCloseDuration;

  static Future<void> show(BuildContext context) {
    final navigator = Navigator.of(context, rootNavigator: true);
    return navigator.push<void>(
      PageRouteBuilder<void>(
        opaque: false,
        barrierDismissible: false,
        pageBuilder: (context, animation, secondaryAnimation) =>
            const FavoriteSuccessPage(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          final curved = CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
          );
          return FadeTransition(
            opacity: curved,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.94, end: 1).animate(curved),
              child: child,
            ),
          );
        },
        transitionDuration: const Duration(milliseconds: 280),
        reverseTransitionDuration: const Duration(milliseconds: 180),
      ),
    );
  }

  @override
  State<FavoriteSuccessPage> createState() => _FavoriteSuccessPageState();
}

class _FavoriteSuccessPageState extends State<FavoriteSuccessPage>
    with TickerProviderStateMixin {
  late final AnimationController _heartController;
  late final Animation<double> _heartScale;
  Timer? _autoCloseTimer;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _heartController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _heartScale = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween<double>(begin: 0.88, end: 1.15)
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 45,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.15, end: 0.97)
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 30,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 0.97, end: 1.0)
            .chain(CurveTween(curve: Curves.easeOutBack)),
        weight: 25,
      ),
    ]).animate(_heartController);

    _heartController.forward();
    _autoCloseTimer = Timer(widget.autoCloseDuration, _closeIfOpen);
  }

  @override
  void dispose() {
    _autoCloseTimer?.cancel();
    _heartController.dispose();
    super.dispose();
  }

  void _closeIfOpen() {
    if (_closed || !mounted) return;
    _closed = true;
    Navigator.of(context, rootNavigator: true).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.24),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Material(
              color: theme.colorScheme.surface,
              elevation: 20,
              borderRadius: BorderRadius.circular(28),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 360),
                padding: const EdgeInsets.fromLTRB(28, 30, 28, 22),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ScaleTransition(
                      scale: _heartScale,
                      child: Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE53935).withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.favorite_rounded,
                          size: 48,
                          color: Color(0xFFE53935),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Agora voce segue essa arena!',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Agora voce pode acessar essa arena rapidamente',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
