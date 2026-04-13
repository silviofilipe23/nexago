import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/payment_service.dart';

final paymentServiceProvider = Provider<PaymentService>((ref) {
  return PaymentService();
});
