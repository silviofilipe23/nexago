import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../../core/firebase/functions_region.dart';

/// Coerção tolerante de número: o SDK de Functions no Flutter entrega
/// `Map<Object?, Object?>` com valores que podem chegar como `int`, `double`
/// ou `String` dependendo do trânsito JSON.
double _asDouble(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

/// Data ISO 8601 tolerante: string vazia ou inválida vira `null` em vez de
/// estourar — nunca chega Timestamp do Firestore aqui, é sempre string ou nada.
DateTime? _asDate(Object? v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
  return null;
}

String _asString(Object? v) => v is String ? v.trim() : '';

/// Um caixa de torneio que a pessoa alcança — dono ou gestor da equipe do
/// evento. Substitui a antiga carteira por pessoa (`organizerWallets/{uid}`):
/// desde a mudança, o dinheiro das inscrições cai no caixa do EVENTO.
class TournamentCashBox {
  const TournamentCashBox({
    required this.tournamentId,
    required this.tournamentName,
    required this.availableReais,
    required this.pendingReais,
  });

  final String tournamentId;
  final String tournamentName;
  final double availableReais;
  final double pendingReais;

  factory TournamentCashBox.fromCallable(Map<String, dynamic> data) {
    return TournamentCashBox(
      tournamentId: _asString(data['tournamentId']),
      tournamentName: _asString(data['tournamentName']),
      availableReais: _asDouble(data['availableReais']),
      pendingReais: _asDouble(data['pendingReais']),
    );
  }
}

/// Chave PIX de saque de quem está logado (`organizerPayoutProfiles/{uid}`).
/// É da PESSOA, não do caixa: cada um saca para a própria chave.
class OrganizerPayoutProfile {
  const OrganizerPayoutProfile({
    required this.pixKey,
    required this.pixKeyType,
    required this.hasPixKey,
  });

  final String pixKey;
  final String pixKeyType;
  final bool hasPixKey;

  factory OrganizerPayoutProfile.fromCallable(Map<String, dynamic> data) {
    return OrganizerPayoutProfile(
      pixKey: _asString(data['pixKey']),
      pixKeyType: _asString(data['pixKeyType']),
      hasPixKey: data['hasPixKey'] == true,
    );
  }

  static const empty = OrganizerPayoutProfile(
    pixKey: '',
    pixKeyType: '',
    hasPixKey: false,
  );
}

class OrganizerLedgerEntry {
  const OrganizerLedgerEntry({
    required this.id,
    required this.netReais,
    required this.grossReais,
    required this.platformFeeReais,
    required this.createdAt,
    this.athleteLabel = '',
  });

  final String id;
  final double netReais;
  final double grossReais;
  final double platformFeeReais;
  final DateTime? createdAt;

  /// Dupla/equipe ou pagador — resolvido na callable a partir da inscrição.
  final String athleteLabel;

  factory OrganizerLedgerEntry.fromCallable(Map<String, dynamic> data) {
    return OrganizerLedgerEntry(
      id: _asString(data['id']),
      netReais: _asDouble(data['netReais']),
      grossReais: _asDouble(data['grossReais']),
      platformFeeReais: _asDouble(data['platformFeeReais']),
      createdAt: _asDate(data['createdAt']),
      athleteLabel: _asString(data['athleteLabel']),
    );
  }
}

class OrganizerWithdrawalItem {
  const OrganizerWithdrawalItem({
    required this.id,
    required this.amountReais,
    required this.status,
    required this.pixKey,
    required this.createdAt,
    this.requestedBy = '',
    this.requestedByStaff = false,
    this.payoutStatus,
  });

  final String id;
  final double amountReais;
  final String status;

  /// Destino do saque. O caixa é compartilhado, então esta linha pode ser o
  /// saque de outra pessoa da equipe — nesse caso a chave já chega MASCARADA
  /// do servidor. Exibir exatamente como recebida, sem re-mascarar.
  final String pixKey;
  final DateTime? createdAt;

  /// uid de quem pediu o saque.
  final String requestedBy;

  /// `true` quando quem pediu não é o dono do evento — foi um gestor da equipe.
  final bool requestedByStaff;
  final String? payoutStatus;

  factory OrganizerWithdrawalItem.fromCallable(Map<String, dynamic> data) {
    final status = _asString(data['status']);
    return OrganizerWithdrawalItem(
      id: _asString(data['id']),
      amountReais: _asDouble(data['amountReais']),
      status: status.isEmpty ? 'pending' : status,
      pixKey: _asString(data['pixKey']),
      createdAt: _asDate(data['createdAt']),
      requestedBy: _asString(data['requestedBy']),
      requestedByStaff: data['requestedByStaff'] == true,
      payoutStatus:
          data['payoutStatus'] is String ? data['payoutStatus'] as String : null,
    );
  }
}

/// Tudo que a tela Financeiro precisa numa chamada só: os caixas de torneio
/// que o chamador alcança (dono + gestor ativo), o perfil de repasse da
/// PESSOA e o extrato/saques do caixa escolhido.
class OrganizerWalletView {
  const OrganizerWalletView({
    required this.cashBoxes,
    required this.selected,
    required this.payout,
    required this.ledger,
    required this.withdrawals,
  });

  final List<TournamentCashBox> cashBoxes;

  /// `null` quando o chamador não alcança caixa nenhum.
  final TournamentCashBox? selected;
  final OrganizerPayoutProfile payout;
  final List<OrganizerLedgerEntry> ledger;
  final List<OrganizerWithdrawalItem> withdrawals;

  /// Parse puro do retorno de `loadOrganizerWalletView`, separado da chamada
  /// porque é a única parte testável sem Firebase — e é onde a forma do
  /// contrato fica fixada.
  factory OrganizerWalletView.fromCallable(Map<String, dynamic> data) {
    final rawTournaments = data['tournaments'];
    final cashBoxes = rawTournaments is List
        ? rawTournaments
            .map((e) => e is Map
                ? TournamentCashBox.fromCallable(Map<String, dynamic>.from(e))
                : null)
            .whereType<TournamentCashBox>()
            .toList()
        : <TournamentCashBox>[];

    final rawSelected = data['selected'];
    final selected = rawSelected is Map
        ? TournamentCashBox.fromCallable(Map<String, dynamic>.from(rawSelected))
        : null;

    final rawPayout = data['payout'];
    final payout = rawPayout is Map
        ? OrganizerPayoutProfile.fromCallable(Map<String, dynamic>.from(rawPayout))
        : OrganizerPayoutProfile.empty;

    final rawLedger = data['ledger'];
    final ledger = rawLedger is List
        ? rawLedger
            .map((e) => e is Map
                ? OrganizerLedgerEntry.fromCallable(Map<String, dynamic>.from(e))
                : null)
            .whereType<OrganizerLedgerEntry>()
            .toList()
        : <OrganizerLedgerEntry>[];

    final rawWithdrawals = data['withdrawals'];
    final withdrawals = rawWithdrawals is List
        ? rawWithdrawals
            .map((e) => e is Map
                ? OrganizerWithdrawalItem.fromCallable(
                    Map<String, dynamic>.from(e))
                : null)
            .whereType<OrganizerWithdrawalItem>()
            .toList()
        : <OrganizerWithdrawalItem>[];

    return OrganizerWalletView(
      cashBoxes: cashBoxes,
      selected: selected,
      payout: payout,
      ledger: ledger,
      withdrawals: withdrawals,
    );
  }
}

class OrganizerWithdrawalRequestResult {
  const OrganizerWithdrawalRequestResult({
    required this.withdrawalId,
    required this.status,
    this.payoutStatus,
    this.autoProcessed = false,
    this.processingMode,
    this.message,
  });

  final String withdrawalId;
  final String status;
  final String? payoutStatus;
  final bool autoProcessed;
  final String? processingMode;
  final String? message;
}

/// Caixa do torneio (`tournamentWallets/{tournamentId}`) + o extrato e os
/// saques dele. Desde a mudança, o dinheiro das inscrições cai no caixa do
/// EVENTO, não mais na carteira por pessoa: qualquer gestor da equipe do
/// torneio saca dele, sempre para a PRÓPRIA chave PIX — dado da pessoa
/// (`organizerPayoutProfiles/{uid}`), não do caixa. Toda escrita passa por
/// Cloud Function; do Firestore o client só lê o saldo, porque a relação
/// gestor → torneio não cabe nas rules a ponto de listar os caixas — quem
/// sabe calcular esse alcance é a callable `loadOrganizerWalletView`.
class OrganizerWalletRepository {
  OrganizerWalletRepository(this._firestore, {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  /// Uma chamada para a lista de caixas + extrato/saques do escolhido.
  /// `tournamentId` ausente (ou fora do alcance) devolve o caixa mais cheio —
  /// a decisão é do servidor, o app não escolhe por conta.
  Future<OrganizerWalletView> loadWalletView({
    String? tournamentId,
    int? ledgerLimit,
  }) async {
    final result = await _functions.httpsCallable('loadOrganizerWalletView').call(
      <String, dynamic>{
        if (tournamentId != null) 'tournamentId': tournamentId,
        if (ledgerLimit != null) 'ledgerLimit': ledgerLimit,
      },
    );
    return OrganizerWalletView.fromCallable(
      Map<String, dynamic>.from(result.data as Map),
    );
  }

  /// Grava a chave de repasse da PESSOA e devolve o que o servidor guardou de
  /// fato. O que foi digitado não é necessariamente o que fica gravado: o
  /// servidor normaliza a chave (telefone ganha `+55`, tipo vira maiúscula) e
  /// ecoa o valor final. Quem exibe destino de saque tem de mostrar o eco, não
  /// o rascunho do formulário — o valor enviado só entra como fallback.
  Future<OrganizerPayoutProfile> setPayoutPixKey({
    required String pixKey,
    required String pixKeyType,
  }) async {
    final result = await _functions.httpsCallable('setOrganizerPayoutPixKey').call(
      <String, dynamic>{'pixKey': pixKey, 'pixKeyType': pixKeyType},
    );
    final data = result.data;
    final map = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
    final echoedPixKey = _asString(map['pixKey']);
    final echoedPixKeyType = _asString(map['pixKeyType']);
    return OrganizerPayoutProfile(
      pixKey: echoedPixKey.isNotEmpty ? echoedPixKey : pixKey.trim(),
      pixKeyType:
          echoedPixKeyType.isNotEmpty ? echoedPixKeyType : pixKeyType.trim().toUpperCase(),
      hasPixKey: (echoedPixKey.isNotEmpty ? echoedPixKey : pixKey.trim()).length >= 5,
    );
  }

  /// Saque do caixa de um torneio. A chave PIX NÃO vai no payload: o destino é
  /// sempre o perfil de quem pede, resolvido no servidor.
  Future<OrganizerWithdrawalRequestResult> requestWithdrawal({
    required String tournamentId,
    required double amountReais,
  }) async {
    final result = await _functions.httpsCallable('requestOrganizerWithdrawal').call(
      <String, dynamic>{'tournamentId': tournamentId, 'amountReais': amountReais},
    );
    final data = result.data;
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      return OrganizerWithdrawalRequestResult(
        withdrawalId: (map['withdrawalId'] as String?) ?? '',
        status: (map['status'] as String?) ?? 'pending',
        payoutStatus: map['payoutStatus'] as String?,
        autoProcessed: map['autoProcessed'] == true,
        processingMode: map['processingMode'] as String?,
        message: map['message'] as String?,
      );
    }
    return const OrganizerWithdrawalRequestResult(
      withdrawalId: '',
      status: 'pending',
    );
  }

  /// Saldo do caixa ao vivo. Virou possível quando as rules passaram a
  /// liberar `tournamentWallets/{id}` para dono e gestor. No erro NÃO emite: o
  /// valor da callable é o autoritativo, e emitir zero aqui transformaria
  /// saldo correto em R$ 0,00 — foi esse o defeito que o portal precisou
  /// consertar.
  Stream<TournamentCashBox?> watchCashBox(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('tournamentWallets')
        .doc(id)
        .snapshots()
        .map<TournamentCashBox?>((snap) {
      // O doc do caixa só guarda id e saldos — nome do torneio já veio da
      // callable e fica com a tela, que não perde o rótulo ao aplicar o
      // saldo ao vivo por cima da linha que já tinha.
      final d = snap.data();
      return TournamentCashBox(
        tournamentId: id,
        tournamentName: '',
        availableReais: _asDouble(d?['availableReais']),
        pendingReais: _asDouble(d?['pendingReais']),
      );
    }).handleError((Object _) {});
  }
}
