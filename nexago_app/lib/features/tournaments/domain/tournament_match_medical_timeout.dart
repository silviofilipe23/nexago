import 'package:cloud_firestore/cloud_firestore.dart';

/// O atendimento médico em andamento, como o doc da partida grava.
///
/// Diferente do tempo técnico (1 minuto, 2 por set, tático), que as mesas tratam como estado
/// local de tela: o tempo médico mora no doc porque é o único intervalo que o telão e as outras
/// mesas precisam enxergar ao vivo — quem está sendo atendido, de qual dupla, e quanto falta —
/// e porque o limite é POR ATLETA NA PARTIDA, então a mesa tem de lembrar quem já usou mesmo
/// depois de recarregar ou de o mesário trocar de superfície.
///
/// A contagem NÃO é um cronômetro gravado: o doc guarda `startedAt` (carimbo do servidor) e a
/// duração, e cada tela calcula o que falta. É o que faz app, mesas web e telão mostrarem o
/// MESMO número sem nenhuma escrita durante os 5 minutos.
///
/// Espelha `MedicalTimeout` de `medical-timeout.ts` (mesas web).
class MatchMedicalTimeout {
  const MatchMedicalTimeout({
    required this.side,
    required this.teamId,
    required this.playerSlot,
    required this.playerName,
    required this.durationSec,
    required this.setIndex,
    this.startedAt,
  });

  /// `'A'` ou `'B'` — o mesmo lado que o resto da mesa usa.
  final String side;
  final String teamId;

  /// Posição do atleta na dupla (1 ou 2) — ver `tournament_match_serving_players.dart`.
  final int playerSlot;

  /// Nome congelado no chamado: o telão mostra quem está sendo atendido sem depender de o join
  /// de perfis ter chegado. Vazio quando a mesa não tinha o nome.
  final String playerName;
  final DateTime? startedAt;
  final int durationSec;
  final int setIndex;

  static MatchMedicalTimeout? fromMap(Map<String, dynamic> map) {
    final side = (map['side'] as String?)?.trim().toUpperCase() ?? '';
    final slot = (map['playerSlot'] as num?)?.toInt() ?? 0;
    if (side != 'A' && side != 'B') return null;
    if (slot != 1 && slot != 2) return null;

    final duration = (map['durationSec'] as num?)?.toInt() ?? 0;
    return MatchMedicalTimeout(
      side: side,
      teamId: (map['teamId'] as String?)?.trim() ?? '',
      playerSlot: slot,
      playerName: (map['playerName'] as String?)?.trim() ?? '',
      startedAt: _timestamp(map['startedAt']),
      durationSec: duration > 0 ? duration : medicalTimeoutSeconds,
      setIndex: (map['setIndex'] as num?)?.toInt() ?? 0,
    );
  }

  static DateTime? _timestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}

/// 5 minutos — atendimento médico das regras de vôlei de praia (CBV/FIVB).
const int medicalTimeoutSeconds = 300;

/// Um tempo médico por ATLETA na partida (não por set, não por dupla).
const int medicalTimeoutsPerPlayer = 1;

/// Chave de quem já usou o atendimento — "A1", "B2". Identifica o ATLETA sem precisar do uid,
/// pela mesma posição na dupla que o saque individual usa.
String medicalTimeoutPlayerKey(String side, int slot) =>
    '${side.toUpperCase()}$slot';

final RegExp _medicalTimeoutPlayerKeyPattern = RegExp(r'^[AB][12]$');

List<String> medicalTimeoutPlayerKeysFromRaw(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<String>()
      .map((v) => v.trim().toUpperCase())
      .where(_medicalTimeoutPlayerKeyPattern.hasMatch)
      .toList(growable: false);
}
