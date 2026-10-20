import 'class_charge_entry.dart';

/// Releituras depois que o atleta volta ao app com fatura em aberto: o
/// webhook do Asaas dá baixa em segundos (PIX `RECEIVED`, cartão
/// `CONFIRMED`), às vezes depois da volta. ~1 min no total, mais denso no
/// começo.
const List<Duration> classChargePaymentWatchDelays = [
  Duration(seconds: 3),
  Duration(seconds: 3),
  Duration(seconds: 4),
  Duration(seconds: 5),
  Duration(seconds: 10),
  Duration(seconds: 15),
  Duration(seconds: 20),
];

/// Mensalidades que vale esperar: as de cobrança online (com fatura ou com o
/// link em preparo). A manual só sai quando a arena dá baixa.
Set<String> classChargesAwaitingOnlinePayment(List<ClassChargeEntry> open) => {
      for (final c in open)
        if (c.canPayOnline || c.payment == 'preparing') c.chargeId,
    };

/// Relê as mensalidades em aberto (`getMyClassCharges` só devolve as em
/// aberto) depois de cada espera em [delays], até alguma de [watched] sumir
/// da lista — paga. Devolve as que sumiram; vazio quando o prazo acaba ou
/// [isCancelled]. Falha de leitura só pula a tentativa: lista vazia por erro
/// não pode virar "pago".
Future<Set<String>> watchClassChargesPaid({
  required Set<String> watched,
  required Future<List<ClassChargeEntry>> Function() fetch,
  List<Duration> delays = classChargePaymentWatchDelays,
  bool Function()? isCancelled,
  Future<void> Function(Duration delay)? wait,
}) async {
  if (watched.isEmpty) return const {};
  final sleep = wait ?? (d) => Future<void>.delayed(d);
  for (final delay in delays) {
    await sleep(delay);
    if (isCancelled?.call() ?? false) return const {};
    final List<ClassChargeEntry> open;
    try {
      open = await fetch();
    } catch (_) {
      continue;
    }
    if (isCancelled?.call() ?? false) return const {};
    final stillOpen = {for (final c in open) c.chargeId};
    final paid = watched.difference(stillOpen);
    if (paid.isNotEmpty) return paid;
  }
  return const {};
}
