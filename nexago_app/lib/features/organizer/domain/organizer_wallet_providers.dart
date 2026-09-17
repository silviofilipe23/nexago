import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
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
/// do caixa que o próprio snapshot diz ser o dele.
///
/// O doc `tournamentWallets/{id}` guarda id e saldos, não o nome do torneio —
/// o caixa que chega pelo stream vem com `tournamentName` vazio. Por isso a
/// fusão mantém o nome da linha carregada: trocar a linha pelo valor do stream
/// deixaria o título do caixa em branco. `live == null` (stream que não emitiu,
/// inclusive por erro) mantém a linha intacta.
///
/// A identidade vem do próprio `live.tournamentId`, não de um terceiro
/// parâmetro: com o id declarado à parte, uma emissão atrasada do caixa
/// anterior podia ser fundida na linha do caixa novo sem ninguém notar.
TournamentCashBox applyLiveBalance(
  TournamentCashBox row,
  TournamentCashBox? live,
) {
  if (live == null || row.tournamentId != live.tournamentId) return row;
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
/// errada. Sem `requestedBy` a função já saiu em `—`, então daí para baixo um
/// `viewerUid` vazio nunca casa com nada e não há como gerar "Você" à toa.
String withdrawalRequesterLabel({
  required String requestedBy,
  required bool requestedByStaff,
  required String viewerUid,
}) {
  final uid = requestedBy.trim();
  if (uid.isEmpty) return '—';
  if (uid == viewerUid.trim()) return 'Você';
  return requestedByStaff ? 'Gestor da equipe' : 'Dono do evento';
}

/// Piso de saque, em reais. Regra de negócio do cliente: a callable
/// (`validateWithdrawalRequestShape`) aceita qualquer valor positivo.
const double minWithdrawalReais = 20;

/// Interpreta o valor digitado. Aceita vírgula e ponto como separador decimal
/// (o teclado do celular oferece um ou outro); vazio e texto inválido viram
/// `null`.
double? parseWithdrawalAmount(String raw) {
  final normalized = raw.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return null;
  return double.tryParse(normalized);
}

/// Erro do valor de saque, ou `null` quando está válido. Campo vazio não é
/// erro: é o estado inicial, e acusar antes de digitar é ruído.
///
/// A folga de `0,001` no teto absorve a diferença de ponto flutuante entre o
/// que foi digitado e o saldo vindo do servidor — sem ela, "sacar tudo" pode
/// ser recusado por um centésimo de centavo.
String? withdrawalAmountError({
  required String raw,
  required double availableReais,
}) {
  if (raw.trim().isEmpty) return null;
  final amount = parseWithdrawalAmount(raw);
  if (amount == null) return 'Informe um valor válido.';
  if (amount < minWithdrawalReais) {
    return 'Mínimo: ${formatBRL(minWithdrawalReais)}.';
  }
  if (amount > availableReais + 0.001) {
    return 'Máximo disponível: ${formatBRL(availableReais)}.';
  }
  return null;
}

/// O pedido de saque está liberado? Diferente de `withdrawalAmountError`, aqui
/// campo vazio é "não" — não há o que pedir.
bool canRequestWithdrawalAmount({
  required String raw,
  required double availableReais,
}) {
  final amount = parseWithdrawalAmount(raw);
  if (amount == null || amount < minWithdrawalReais) return false;
  return withdrawalAmountError(raw: raw, availableReais: availableReais) == null;
}
