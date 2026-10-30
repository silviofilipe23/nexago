import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Trilho de "deslizar para confirmar": arrastar o polegar até o fim dispara
/// [onConfirmed]. Soltar antes devolve o polegar ao início.
///
/// Entrar num modo (o Focus) é um gesto, não um link: o arraste deixa isso
/// claro e evita a entrada por toque acidental na rolagem da Home.
///
/// Acessível sem gesto: tocar no trilho mostra um empurrãozinho no polegar
/// (a dica de que é para arrastar), e o leitor de tela anuncia um botão
/// [semanticLabel] que confirma com o toque duplo de sempre.
class NexaSlideToConfirm extends StatefulWidget {
  const NexaSlideToConfirm({
    super.key,
    required this.label,
    required this.semanticLabel,
    required this.onConfirmed,
    this.icon = Icons.local_fire_department_rounded,
    this.color = AppColors.brand,
    this.height = 50,
  });

  final String label;
  final String semanticLabel;
  final VoidCallback onConfirmed;
  final IconData icon;
  final Color color;
  final double height;

  /// Fração do trilho a partir da qual soltar já confirma.
  static const double threshold = 0.85;

  @override
  State<NexaSlideToConfirm> createState() => _NexaSlideToConfirmState();
}

class _NexaSlideToConfirmState extends State<NexaSlideToConfirm>
    with SingleTickerProviderStateMixin {
  static const double _pad = 4;

  late final AnimationController _position = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  bool _confirming = false;

  @override
  void dispose() {
    _position.dispose();
    super.dispose();
  }

  double get _thumbSize => widget.height - _pad * 2;

  void _onDragUpdate(DragUpdateDetails details, double travel) {
    if (_confirming || travel <= 0) return;
    _position.value += details.primaryDelta! / travel;
  }

  void _onDragEnd(DragEndDetails details) {
    if (_confirming) return;
    final flung = (details.primaryVelocity ?? 0) > 900;
    if (_position.value >= NexaSlideToConfirm.threshold || flung) {
      _confirm();
    } else {
      _position.animateBack(0, curve: Curves.easeOutCubic);
    }
  }

  Future<void> _confirm() async {
    if (_confirming) return;
    _confirming = true;
    HapticFeedback.mediumImpact();
    await _position.animateTo(1, curve: Curves.easeOutCubic);
    if (!mounted) return;
    widget.onConfirmed();
    // Volta ao início por baixo da tela que abriu: quem retorna encontra o
    // trilho pronto para outra entrada, sem ver o polegar voltando.
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
    _position.value = 0;
    _confirming = false;
  }

  Future<void> _hint() async {
    if (_confirming || _position.isAnimating) return;
    await _position.animateTo(0.22, curve: Curves.easeOut);
    if (!mounted) return;
    await _position.animateBack(0, curve: Curves.elasticOut);
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color;
    final radius = BorderRadius.circular(14);

    return Semantics(
      button: true,
      label: widget.semanticLabel,
      onTap: widget.onConfirmed,
      excludeSemantics: true,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final travel = constraints.maxWidth - _thumbSize - _pad * 2;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _hint,
            onHorizontalDragUpdate: (d) => _onDragUpdate(d, travel),
            onHorizontalDragEnd: _onDragEnd,
            child: Container(
              height: widget.height,
              decoration: BoxDecoration(
                borderRadius: radius,
                border: Border.all(color: color.withValues(alpha: 0.30)),
                gradient: LinearGradient(
                  colors: [
                    color.withValues(alpha: 0.28),
                    color.withValues(alpha: 0.06),
                  ],
                ),
              ),
              child: AnimatedBuilder(
                animation: _position,
                builder: (context, _) {
                  final t = _position.value;
                  final left = _pad + travel * t;
                  return Stack(
                    alignment: Alignment.centerLeft,
                    children: [
                      // Rastro preenchido atrás do polegar.
                      Positioned(
                        left: _pad,
                        top: _pad,
                        bottom: _pad,
                        width: left - _pad + _thumbSize,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.22),
                            borderRadius: BorderRadius.circular(11),
                          ),
                        ),
                      ),
                      Positioned.fill(
                        left: _thumbSize + _pad * 2,
                        child: Center(
                          child: Opacity(
                            opacity: (1 - t * 1.6).clamp(0.0, 1.0),
                            child: Text(
                              '${widget.label}  ›››',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.mono(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: color,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        key: const Key('nexa-slide-thumb'),
                        left: left,
                        child: Container(
                          width: _thumbSize,
                          height: _thumbSize,
                          decoration: BoxDecoration(
                            color: color,
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Icon(
                            t >= 1 ? Icons.check_rounded : widget.icon,
                            size: 20,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }
}
