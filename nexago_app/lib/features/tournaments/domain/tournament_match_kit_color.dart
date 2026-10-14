import 'dart:ui' show Color;

/// Cor da camisa de uma dupla NA PARTIDA — é o que o árbitro usa pra associar a dupla em
/// quadra à metade certa da tela. Não é da dupla: a mesma dupla pode usar outra cor em outro
/// jogo.
///
/// O laranja fica fora da lista porque é a cor do saque.
class KitColor {
  const KitColor({
    required this.id,
    required this.label,
    required this.hex,
    required this.onHex,
  });

  final String id;
  final String label;

  /// Cor da camisa.
  final Color hex;

  /// Cor do texto SOBRE [hex].
  final Color onHex;
}

abstract final class KitColors {
  KitColors._();

  static const blue = KitColor(
    id: 'blue',
    label: 'Azul',
    hex: Color(0xFF2E6BFF),
    onHex: Color(0xFFFFFFFF),
  );
  static const yellow = KitColor(
    id: 'yellow',
    label: 'Amarelo',
    hex: Color(0xFFFFD21F),
    onHex: Color(0xFF000000),
  );
  static const white = KitColor(
    id: 'white',
    label: 'Branco',
    hex: Color(0xFFF4F4F5),
    onHex: Color(0xFF000000),
  );
  static const black = KitColor(
    id: 'black',
    label: 'Preto',
    hex: Color(0xFF151517),
    onHex: Color(0xFFFFFFFF),
  );
  static const green = KitColor(
    id: 'green',
    label: 'Verde',
    hex: Color(0xFF19B35A),
    onHex: Color(0xFF000000),
  );
  static const red = KitColor(
    id: 'red',
    label: 'Vermelho',
    hex: Color(0xFFE0303A),
    onHex: Color(0xFFFFFFFF),
  );

  static const all = [blue, yellow, white, black, green, red];

  /// Padrão: azul pra dupla A, amarelo pra B.
  static const defaultA = blue;
  static const defaultB = yellow;

  /// `null` quando o id é vazio ou desconhecido (partida antiga, outra versão do app).
  static KitColor? byId(String? id) {
    final key = id?.trim().toLowerCase() ?? '';
    for (final color in all) {
      if (color.id == key) return color;
    }
    return null;
  }

  /// A cor da dupla [side] (`'A'`/`'B'`): a gravada na partida ou, sem ela, o padrão.
  static KitColor forSide(String side, {String? idA, String? idB}) {
    final isA = side.toUpperCase() == 'A';
    return byId(isA ? idA : idB) ?? (isA ? defaultA : defaultB);
  }

  /// Escolhe [chosen] pra dupla [side]. As duas duplas NÃO podem ter a mesma cor: se a
  /// escolhida é a da outra, as duas trocam.
  static ({KitColor a, KitColor b}) pick({
    required String side,
    required KitColor chosen,
    required KitColor currentA,
    required KitColor currentB,
  }) {
    if (side.toUpperCase() == 'A') {
      return chosen.id == currentB.id
          ? (a: chosen, b: currentA)
          : (a: chosen, b: currentB);
    }
    return chosen.id == currentA.id
        ? (a: currentB, b: chosen)
        : (a: currentA, b: chosen);
  }
}
