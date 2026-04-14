import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Tela reutilizável de sucesso (estilo clean): check, título, mensagem e ações.
///
/// Animações: entrada com fade + scale; ícone com leve bounce.
class SuccessPage extends StatefulWidget {
  const SuccessPage({
    super.key,
    required this.title,
    this.message,
    required this.primaryActionLabel,
    required this.onPrimaryAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
  }) : assert(
          (secondaryActionLabel == null && onSecondaryAction == null) ||
              (secondaryActionLabel != null && onSecondaryAction != null),
          'secondaryActionLabel e onSecondaryAction devem vir juntos ou ambos omitidos.',
        );

  final String title;
  final String? message;
  final String primaryActionLabel;
  final VoidCallback onPrimaryAction;
  final String? secondaryActionLabel;
  final VoidCallback? onSecondaryAction;

  @override
  State<SuccessPage> createState() => _SuccessPageState();
}

class _SuccessPageState extends State<SuccessPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  /// Conteúdo (texto + botões): fade + scale.
  late final Animation<double> _contentT;

  /// Ícone: escala com leve overshoot (bounce).
  late final Animation<double> _iconScale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 880),
    );

    _contentT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.62, curve: Curves.easeOutCubic),
    );

    _iconScale = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(begin: 0.0, end: 1.12)
            .chain(CurveTween(curve: Curves.easeOutBack)),
        weight: 55,
      ),
      TweenSequenceItem(
        tween: Tween(begin: 1.12, end: 1.0)
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 45,
      ),
    ]).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.08, 0.92, curve: Curves.linear),
      ),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  static const Color _successGreen = Color(0xFF0D8A5B);
  static const Color _successBg = Color(0xFFE8F5F0);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mq = MediaQuery.of(context);
    final bottomInset = mq.padding.bottom;

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(24, 32, 24, 24 + bottomInset),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 12),
                    ScaleTransition(
                      scale: _iconScale,
                      child: Center(
                        child: Container(
                          width: 104,
                          height: 104,
                          decoration: BoxDecoration(
                            color: _successBg,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: _successGreen.withValues(alpha: 0.12),
                                blurRadius: 28,
                                offset: const Offset(0, 12),
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.check_rounded,
                            size: 56,
                            color: _successGreen,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 40),
                    AnimatedBuilder(
                      animation: _controller,
                      builder: (context, child) {
                        final t = _contentT.value;
                        final scale = 0.92 + 0.08 * t;
                        return Opacity(
                          opacity: t,
                          child: Transform.scale(
                            scale: scale,
                            alignment: Alignment.topCenter,
                            child: child,
                          ),
                        );
                      },
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            widget.title,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.6,
                              height: 1.15,
                            ),
                          ),
                          if (widget.message != null &&
                              widget.message!.trim().isNotEmpty) ...[
                            const SizedBox(height: 16),
                            Text(
                              widget.message!.trim(),
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: AppColors.onSurfaceMuted,
                                height: 1.5,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                          const SizedBox(height: 48),
                          SizedBox(
                            width: double.infinity,
                            height: 54,
                            child: FilledButton(
                              onPressed: widget.onPrimaryAction,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.brand,
                                foregroundColor: Colors.white,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              child: Text(
                                widget.primaryActionLabel,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.2,
                                ),
                              ),
                            ),
                          ),
                          if (widget.secondaryActionLabel != null) ...[
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: TextButton(
                                onPressed: widget.onSecondaryAction,
                                style: TextButton.styleFrom(
                                  foregroundColor: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.75),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                ),
                                child: Text(
                                  widget.secondaryActionLabel!,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
