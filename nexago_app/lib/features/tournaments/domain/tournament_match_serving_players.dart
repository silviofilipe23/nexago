/// Ordem de saque declarada por cada dupla no set corrente.
///
/// O doc da partida não conhece atleta, só `teamAId`/`teamBId`, e a mesa grava o ponto DENTRO
/// de uma transação que lê apenas esse doc. Por isso o saque individual é uma POSIÇÃO na dupla
/// (1 ou 2), nunca um uid: a posição é a mesma ordem de `player1Id`/`player2Id` do doc em
/// `teams`, que é a ordem em que as mesas, o telão e os cards já listam os dois atletas
/// ("Bruno / Lucas"). Quem exibe resolve o nome com o doc da dupla que JÁ carregou pro rótulo.
///
/// Espelha `ServingPlayerSlots` de `serving-player.ts` (mesas web).
class MatchServingPlayers {
  const MatchServingPlayers({this.a = 0, this.b = 0});

  /// `0` = a dupla ainda não declarou quem abre o saque dela neste set.
  final int a;
  final int b;

  static const MatchServingPlayers none = MatchServingPlayers();

  factory MatchServingPlayers.fromMap(Map<String, dynamic> map) {
    return MatchServingPlayers(
      a: _slot(map['A']),
      b: _slot(map['B']),
    );
  }

  Map<String, dynamic> toMap() => {'A': a, 'B': b};

  int slotForSide(String side) => side.toUpperCase() == 'A' ? a : b;

  MatchServingPlayers withSide(String side, int slot) {
    final value = _slot(slot);
    return side.toUpperCase() == 'A'
        ? MatchServingPlayers(a: value, b: b)
        : MatchServingPlayers(a: a, b: value);
  }

  static int _slot(dynamic raw) {
    final value = raw is num ? raw.toInt() : null;
    return value == 1 || value == 2 ? value! : 0;
  }

  @override
  bool operator ==(Object other) =>
      other is MatchServingPlayers && other.a == a && other.b == b;

  @override
  int get hashCode => Object.hash(a, b);
}
