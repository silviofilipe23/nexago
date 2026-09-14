import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';

class BracketConnectorPainter extends CustomPainter {
  BracketConnectorPainter({
    required this.layout,
    required this.nodeByMatchId,
  });

  final DoubleEliminationBracketLayout layout;
  final Map<String, BracketLayoutNode> nodeByMatchId;

  /// Ponto de saída da linha: borda DIREITA quando o destino está à direita,
  /// borda ESQUERDA quando está à esquerda. Na forma convergente a LB corre da
  /// direita para o centro, então o sentido não pode ser fixo.
  @visibleForTesting
  Offset debugStartFor(BracketLayoutNode from, BracketLayoutNode to) {
    final paraDireita = to.position.dx >= from.position.dx;
    return Offset(
      paraDireita ? from.position.dx + from.size.width : from.position.dx,
      from.position.dy + from.size.height / 2,
    );
  }

  @visibleForTesting
  Offset debugEndFor(BracketLayoutNode from, BracketLayoutNode to) {
    final paraDireita = to.position.dx >= from.position.dx;
    return Offset(
      paraDireita ? to.position.dx : to.position.dx + to.size.width,
      to.position.dy + to.size.height / 2,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.85)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    for (final edge in layout.edges) {
      final from = nodeByMatchId[edge.fromMatchId];
      final to = nodeByMatchId[edge.toMatchId];
      if (from == null || to == null) continue;

      final start = debugStartFor(from, to);
      final end = debugEndFor(from, to);

      // Não existe mais aresta de MESMA coluna: a única fonte disso era a
      // partida de cruzamento entrando na Final (plantas 10/12/32), e a
      // Final não recebe mais linha nenhuma em chave de dupla eliminação
      // (pedido do dono) — ela e o 3º lugar moram lado a lado nas colunas
      // vizinhas ao centro, não mais empilhadas na faixa central. O cotovelo
      // comum abaixo cobre toda aresta que sobra.
      final midX = start.dx + (end.dx - start.dx) / 2;
      canvas.drawPath(
        Path()
          ..moveTo(start.dx, start.dy)
          ..lineTo(midX, start.dy)
          ..lineTo(midX, end.dy)
          ..lineTo(end.dx, end.dy),
        paint,
      );
    }

    // Linha livre do lado sem alimentador (bye e entrada de perdedor): traço
    // horizontal até a coluna vizinha, sem card na ponta — como na folha.
    final livre = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.35)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (final slot in layout.emptySlots) {
      canvas.drawLine(slot.from, slot.to, livre);
    }
  }

  @override
  bool shouldRepaint(covariant BracketConnectorPainter oldDelegate) {
    return oldDelegate.layout != layout;
  }
}
