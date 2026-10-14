import 'package:cloud_firestore/cloud_firestore.dart';

/// Tipo do cartão da súmula.
enum MatchSanctionCard {
  /// Advertência — só registra.
  yellow,

  /// Penalidade — o adversário ganha o ponto (e o saque).
  red;

  String get wire => name;

  String get label => this == yellow ? 'Amarelo' : 'Vermelho';

  static MatchSanctionCard? fromWire(dynamic raw) {
    final value = raw is String ? raw.trim().toLowerCase() : '';
    for (final card in values) {
      if (card.name == value) return card;
    }
    return null;
  }
}

/// Um cartão lançado na súmula, como `sanctions[]` do doc da partida grava.
///
/// O atleta é identificado pela posição no elenco ([playerSlot]), a mesma chave do saque
/// individual e do tempo médico. O nome vai congelado: a súmula não depende do join de perfis.
class MatchSanction {
  const MatchSanction({
    required this.id,
    required this.card,
    required this.side,
    required this.playerSlot,
    required this.playerName,
    required this.setIndex,
    required this.scoreA,
    required this.scoreB,
    this.reason = '',
    this.at,
  });

  /// Identifica o cartão na remoção — o array não tem id próprio.
  final String id;
  final MatchSanctionCard card;

  /// `'A'` ou `'B'`.
  final String side;
  final int playerSlot;
  final String playerName;
  final int setIndex;

  /// Placar do set no instante do cartão (antes do ponto da penalidade).
  final int scoreA;
  final int scoreB;
  final String reason;
  final DateTime? at;

  bool get isRed => card == MatchSanctionCard.red;

  Map<String, dynamic> toMap() => {
    'id': id,
    'card': card.wire,
    'side': side,
    'playerSlot': playerSlot,
    'playerName': playerName,
    'setIndex': setIndex,
    'scoreA': scoreA,
    'scoreB': scoreB,
    if (reason.isNotEmpty) 'reason': reason,
    // Array do Firestore não aceita `serverTimestamp()`: vai o relógio do aparelho.
    'at': Timestamp.fromDate(at ?? DateTime.now()),
  };

  static MatchSanction? fromMap(Map<String, dynamic> map) {
    final card = MatchSanctionCard.fromWire(map['card']);
    final side = (map['side'] as String?)?.trim().toUpperCase() ?? '';
    final slot = (map['playerSlot'] as num?)?.toInt() ?? 0;
    final id = (map['id'] as String?)?.trim() ?? '';
    if (card == null || id.isEmpty) return null;
    if (side != 'A' && side != 'B') return null;
    final at = map['at'];
    return MatchSanction(
      id: id,
      card: card,
      side: side,
      playerSlot: slot,
      playerName: (map['playerName'] as String?)?.trim() ?? '',
      setIndex: (map['setIndex'] as num?)?.toInt() ?? 0,
      scoreA: (map['scoreA'] as num?)?.toInt() ?? 0,
      scoreB: (map['scoreB'] as num?)?.toInt() ?? 0,
      reason: (map['reason'] as String?)?.trim() ?? '',
      at: at is Timestamp ? at.toDate() : (at is DateTime ? at : null),
    );
  }

  static List<MatchSanction> listFromRaw(dynamic raw) {
    if (raw is! List) return const [];
    return [
      for (final entry in raw)
        if (entry is Map)
          ?MatchSanction.fromMap(Map<String, dynamic>.from(entry)),
    ];
  }
}
