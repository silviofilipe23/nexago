import 'package:flutter/material.dart';

import '../../../domain/sand_rank/sand_rank_reward_catalog.dart';

const _knownFrameRankCodes = {
  'INICIANTE',
  'COMPETIDOR',
  'DESAFIANTE',
  'ELITE',
  'MESTRE',
  'LENDA',
};

const _goldColor = Color(0xFFD4A017);

/// Decodifica um `frameId` (`FRAME_{ELO}` ou `FRAME_{ELO}_GOLD`) nos dados
/// visuais da moldura. Retorna `null` para ids desconhecidos.
({String rankCode, bool gold})? sandRankFrameSpec(String? frameId) {
  final id = frameId?.trim() ?? '';
  if (!id.startsWith('FRAME_')) return null;
  var code = id.substring('FRAME_'.length);
  final gold = code.endsWith('_GOLD');
  if (gold) code = code.substring(0, code.length - '_GOLD'.length);
  if (!_knownFrameRankCodes.contains(code)) return null;
  return (rankCode: code, gold: gold);
}

/// Moldura de avatar da trilha de elos — anel em gradiente na cor do elo
/// equipado, variante dourada (`_GOLD`) e glow pulsante para a de Lenda.
///
/// Sem `frameId` (ou id desconhecido) renderiza só o [child], sem custo.
/// O footprint cresce ~2×ringWidth; os slots de avatar existentes acomodam.
class SandRankAvatarFrame extends StatelessWidget {
  const SandRankAvatarFrame({
    super.key,
    required this.frameId,
    required this.size,
    required this.child,
  });

  /// Id da recompensa equipada (`users/{uid}.sandRankCosmetics.frameId`).
  final String? frameId;

  /// Diâmetro do avatar embrulhado.
  final double size;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final spec = sandRankFrameSpec(frameId);
    if (spec == null) return child;

    final baseColor = spec.gold ? _goldColor : sandRankColor(spec.rankCode);
    final ringWidth = (size * 0.05).clamp(2.5, 6.0);
    final isLegend = spec.rankCode == 'LENDA';

    final ring = Container(
      padding: EdgeInsets.all(ringWidth),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: SweepGradient(
          colors: [
            baseColor,
            Color.lerp(baseColor, Colors.white, 0.45)!,
            baseColor,
            Color.lerp(baseColor, Colors.black, 0.25)!,
            baseColor,
          ],
        ),
      ),
      child: child,
    );

    if (!isLegend) return ring;
    return _LegendGlow(color: baseColor, child: ring);
  }
}

/// Glow dourado pulsante, exclusivo da moldura de Lenda.
class _LegendGlow extends StatefulWidget {
  const _LegendGlow({required this.color, required this.child});

  final Color color;
  final Widget child;

  @override
  State<_LegendGlow> createState() => _LegendGlowState();
}

class _LegendGlowState extends State<_LegendGlow>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: widget.color.withValues(alpha: 0.25 + 0.3 * t),
                blurRadius: 10 + 8 * t,
                spreadRadius: 1 + t,
              ),
            ],
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}
