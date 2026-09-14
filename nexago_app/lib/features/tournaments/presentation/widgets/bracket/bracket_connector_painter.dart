import 'package:flutter/foundation.dart';
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

  /// X do desvio do contorno "por fora" (aresta de MESMA coluna — cruzamento
  /// entrando na final, plantas 10/12/32). Usa 3/4 do `columnGap`, nunca a
  /// metade: o `midX` de QUALQUER aresta entre colunas vizinhas cai
  /// exatamente na metade do gap entre as duas bordas internas (start/end
  /// ficam sempre a exatamente `columnGap` de distância, por construção da
  /// grade de colunas). Nas plantas 10/12/32 a coluna central recebe uma
  /// aresta vizinha pela MESMA borda direita que o contorno usa (ex.: planta
  /// 12, #17→#19 chega pela borda direita de #19, e #19→#22 contorna por ali
  /// também) — com a mesma fração de 1/2 os dois segmentos verticais caíam
  /// no mesmo x e o traço virava um "cano" contínuo sem separação visual
  /// entre as duas ligações (achado da revisão do dono). 3/4 continua dentro
  /// do mesmo vão (não invade a coluna vizinha), mas nunca coincide com a
  /// metade que as arestas normais usam.
  @visibleForTesting
  double debugDetourXFor(BracketLayoutNode from) {
    return from.position.dx +
        from.size.width +
        BracketLayoutMetrics.columnGap * 3 / 4;
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

      if ((from.position.dx - to.position.dx).abs() < 1) {
        // MESMA COLUNA — é a partida de cruzamento entrando na final, que mora
        // na faixa central junto dela. Compare a posição dos CARDS, nunca
        // start/end: com os dois na mesma coluna, `debugStartFor` devolve a
        // borda direita e `debugEndFor` a esquerda, e a diferença é a largura
        // do card, não zero.
        //
        // O cotovelo normal desenharia o segmento vertical no meio horizontal
        // da coluna, ou seja, POR DENTRO dos cards empilhados entre os dois —
        // e como o painter é o primeiro filho do Stack, a linha some atrás
        // deles. Nas plantas 10, 12 e 32 a ordem da coluna central é
        // [cruzamento, 3º lugar, final, cruzamento], então a linha do primeiro
        // cruzamento até a final desaparece atrás do card do 3º lugar e passa
        // a impressão de que aquele jogo alimenta o 3º lugar.
        //
        // Contorna por FORA, saindo e entrando pela mesma borda direita.
        final borda = from.position.dx + from.size.width;
        final desvio = debugDetourXFor(from);
        canvas.drawPath(
          Path()
            ..moveTo(borda, start.dy)
            ..lineTo(desvio, start.dy)
            ..lineTo(desvio, end.dy)
            ..lineTo(borda, end.dy),
          paint,
        );
        continue;
      }

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
