import 'package:flutter/foundation.dart';

import 'arena_comanda.dart';
import 'arena_comanda_payment.dart';

@immutable
class ArenaComandaClosedArgs {
  const ArenaComandaClosedArgs({
    required this.comanda,
    required this.payments,
  });

  final ArenaComanda comanda;
  final List<ArenaComandaPayment> payments;
}
