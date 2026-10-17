import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/store_checkout_models.dart';
import '../domain/store_checkout_rules.dart';
import '../domain/store_checkout_service.dart';

/// ViaCEP: consulta pública de CEP, sem chave (o mesmo serviço do portal).
/// `dart:io` puro — o app não tem o pacote `http`.
class ViaCepLookup implements StoreCepLookup {
  ViaCepLookup({this.timeout = const Duration(seconds: 6)});

  final Duration timeout;

  @override
  Future<StoreViaCepAddress?> lookup(String cep) async {
    final digits = cep.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 8) return null;
    final client = HttpClient()..connectionTimeout = timeout;
    try {
      final request = await client
          .getUrl(Uri.parse('https://viacep.com.br/ws/$digits/json/'))
          .timeout(timeout);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      final response = await request.close().timeout(timeout);
      if (response.statusCode != HttpStatus.ok) return null;
      final body =
          await response.transform(utf8.decoder).join().timeout(timeout);
      return storeViaCepFromMap(jsonDecode(body));
    } catch (_) {
      // Sem rede, CEP inválido ou ViaCEP fora do ar: o atleta digita na mão.
      return null;
    } finally {
      client.close(force: true);
    }
  }
}

final storeCepLookupProvider =
    Provider<StoreCepLookup>((ref) => ViaCepLookup());
