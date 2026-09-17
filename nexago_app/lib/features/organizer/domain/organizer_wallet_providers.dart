import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/organizer_wallet_repository.dart';

/// Quantos créditos de inscrição a tela Financeiro pede por carga.
const int organizerLedgerLimit = 30;

final organizerWalletRepositoryProvider =
    Provider<OrganizerWalletRepository>((ref) {
  return OrganizerWalletRepository(ref.watch(firestoreProvider));
});

/// UID do organizador logado.
final currentOrganizerIdProvider = Provider<String?>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid;
});

/// Caixa de evento escolhido na tela. `null` = ainda não escolheu nada, e aí
/// quem decide é o servidor (devolve o caixa mais cheio) — o app não escolhe
/// por conta própria.
final selectedCashBoxIdProvider = StateProvider.autoDispose<String?>((ref) {
  return null;
});

/// Carga da tela Financeiro numa chamada só: os caixas de evento que a pessoa
/// alcança (dono + gestor da equipe), a chave PIX dela e o extrato/saques do
/// caixa escolhido. A família é por `tournamentId` porque trocar de caixa é
/// uma carga nova — o extrato e os saques são do caixa escolhido, não dá para
/// reaproveitar.
final organizerWalletViewProvider = FutureProvider.autoDispose
    .family<OrganizerWalletView, String?>((ref, tournamentId) {
  return ref.watch(organizerWalletRepositoryProvider).loadWalletView(
        tournamentId: tournamentId,
        ledgerLimit: organizerLedgerLimit,
      );
});

/// Saldo ao vivo do caixa em exibição: uma inscrição paga durante a visita cai
/// aqui sem recarregar a tela. A família com `autoDispose` fecha o listener do
/// caixa anterior quando a tela passa a observar outro. No erro o stream não
/// emite (ver `watchCashBox`), então o valor autoritativo da callable continua
/// na tela em vez de virar R$ 0,00.
final organizerCashBoxLiveProvider = StreamProvider.autoDispose
    .family<TournamentCashBox?, String>((ref, tournamentId) {
  return ref.watch(organizerWalletRepositoryProvider).watchCashBox(tournamentId);
});

/// Soma dos caixas que a pessoa alcança.
class TournamentCashBoxTotals {
  const TournamentCashBoxTotals({
    required this.availableReais,
    required this.pendingReais,
  });

  final double availableReais;
  final double pendingReais;
}

/// Arredonda a 2 casas porque a soma é de dinheiro: em `double`,
/// `0.1 + 0.2` dá `0.30000000000000004` e a tela mostraria isso.
double _round2(double value) => (value * 100).roundToDouble() / 100;

/// Total dos caixas alcançados — é o que a tela mostra acima da lista quando
/// há mais de um evento, para a soma não ter de ser feita de cabeça.
TournamentCashBoxTotals sumCashBoxes(List<TournamentCashBox> boxes) {
  var available = 0.0;
  var pending = 0.0;
  for (final box in boxes) {
    available += box.availableReais;
    pending += box.pendingReais;
  }
  return TournamentCashBoxTotals(
    availableReais: _round2(available),
    pendingReais: _round2(pending),
  );
}

/// Aplica o saldo ao vivo SOBRE a linha que a callable trouxe, e só na linha
/// do caixa observado.
///
/// O doc `tournamentWallets/{id}` guarda id e saldos, não o nome do torneio —
/// o caixa que chega pelo stream vem com `tournamentName` vazio. Por isso a
/// fusão mantém o nome da linha carregada: trocar a linha pelo valor do stream
/// deixaria o título do caixa em branco. `live == null` (stream que não emitiu,
/// inclusive por erro) mantém a linha intacta.
TournamentCashBox applyLiveBalance(
  TournamentCashBox row,
  String tournamentId,
  TournamentCashBox? live,
) {
  if (live == null || row.tournamentId != tournamentId) return row;
  return TournamentCashBox(
    tournamentId: row.tournamentId,
    tournamentName: row.tournamentName,
    availableReais: live.availableReais,
    pendingReais: live.pendingReais,
  );
}

/// Quem pediu o saque, do ponto de vista de quem está olhando a lista.
///
/// Sem nome de pessoa: a callable manda o uid de quem pediu e o flag
/// `requestedByStaff` (quem pediu não é o dono do evento). Saque sem
/// `requestedBy` — registro antigo, campo ausente — vira `—`, porque
/// `requestedByStaff` ausente também chega como `false` e `false` não
/// significa "dono". É melhor não dizer nada do que atribuir o saque à pessoa
/// errada; por isso `viewerUid` vazio também não gera "Você".
String withdrawalRequesterLabel({
  required String requestedBy,
  required bool requestedByStaff,
  required String viewerUid,
}) {
  final uid = requestedBy.trim();
  if (uid.isEmpty) return '—';
  if (viewerUid.isNotEmpty && uid == viewerUid.trim()) return 'Você';
  return requestedByStaff ? 'Gestor da equipe' : 'Dono do evento';
}
