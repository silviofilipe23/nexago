import 'squad_models.dart';

/// Leitura e ações do atleta no NexaSquad.
///
/// O atleta não lê contrato, comissões nem regras (rules do backoffice): tudo
/// passa pelas callables de `functions/src/squad-athlete.ts`, que devolvem só
/// o que é dele. A flag `appConfig/squad.enabled` liga as entradas do app.
abstract interface class SquadRepository {
  /// `appConfig/squad.enabled`; doc ausente = desligado.
  Stream<bool> watchEnabled();

  /// `getMySquad`: contrato vivo com ganhos e pontos, ou o convite em aberto.
  Future<MySquad> fetchMySquad();

  /// `getSquadRanking`: embaixadores do ciclo por pontos.
  Future<SquadRanking> fetchRanking();

  /// `viewSquadInvite`: ver o convite também o marca como aberto.
  Future<SquadInvite> viewInvite(String inviteId);

  /// `acceptSquadInvite`: cria o contrato com o código escolhido.
  Future<void> acceptInvite({required String inviteId, required String code});

  /// `acceptSquadAmendment`: o nível do aditivo passa a valer.
  Future<void> acceptAmendment();

  /// `checkSquadCode`: confere o código (ou a indicação por link) antes de
  /// cobrar. [code] vazio devolve a indicação por link/QR, se houver.
  /// [purpose] = `registration` (padrão), `booking` (com [arenaId], cuja taxa
  /// é o teto) ou `club`.
  Future<SquadCodeCheck> checkCode({
    required String code,
    required List<String> athleteUids,
    required String registrationId,
    String purpose = 'registration',
    String? arenaId,
  });
}

/// Erro com a copy pronta para o atleta. [field] = `code` quando o servidor
/// recusou o código escolhido no aceite.
class SquadException implements Exception {
  const SquadException(this.message, {this.field});

  final String message;
  final String? field;

  @override
  String toString() => message;
}
