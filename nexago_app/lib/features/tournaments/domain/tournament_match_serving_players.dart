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

  /// `0` = a equipe ainda não declarou quem abre o saque dela neste set. 1–5 = posição no
  /// elenco (individual só tem o 1; dupla 1–2; equipe até 5 — multiesporte fase 4d2).
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
    return value != null && value >= 1 && value <= 5 ? value : 0;
  }

  @override
  bool operator ==(Object other) =>
      other is MatchServingPlayers && other.a == a && other.b == b;

  @override
  int get hashCode => Object.hash(a, b);
}

/// Atletas por lado (1 individual, 2 dupla, 3–5 equipe). O doc da partida não sabe o elenco; a
/// mesa preenche com o que já carregou dos docs de `teams`. Ausente = dupla, como sempre foi.
///
/// Espelha `RosterSizes` de `serving-player.ts` (mesas web, 4b2).
class MatchRosterSizes {
  const MatchRosterSizes({this.a = 2, this.b = 2});

  final int a;
  final int b;

  static const MatchRosterSizes dupla = MatchRosterSizes();

  /// Elenco do lado; fora de 1–5 vira dupla.
  int forSide(String side) {
    final n = side.toUpperCase() == 'A' ? a : b;
    return n >= 1 && n <= 5 ? n : 2;
  }

  @override
  bool operator ==(Object other) =>
      other is MatchRosterSizes && other.a == a && other.b == b;

  @override
  int get hashCode => Object.hash(a, b);
}

/// Elenco a partir do `memberUids` GRAVADO no doc da equipe: 1 = individual, 3–5 = equipe.
/// Dupla legada (sem `memberUids`) e dupla incompleta (o mesmo uid nos dois lugares) seguem 2 —
/// não deduplica de propósito, senão a dupla procurando parceiro viraria individual na mesa.
int rosterSizeFromMemberUids(List<String>? memberUids) {
  final ids = (memberUids ?? const <String>[])
      .map((uid) => uid.trim())
      .where((uid) => uid.isNotEmpty)
      .toList();
  final n = ids.length;
  if (n < 1 || n > 5) return 2;
  if (n == 2 && ids[0] == ids[1]) return 2;
  return n;
}
