import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_service.dart';

/// O `serverClientId` do login com Google precisa ser o OAuth client de tipo
/// **Web** (`client_type: 3`) do projeto Firebase. Um id de outro tipo (iOS,
/// Android) faz o Google Sign-In no Android falhar com `ApiException: 10`
/// depois da seleção da conta — foi exatamente o bug que quebrou o login com
/// Google nas versões de teste da Play Store (ago/2026).
void main() {
  test('serverClientId é o Web client (client_type 3) do google-services.json',
      () {
    final file = File('android/app/google-services.json');
    expect(file.existsSync(), isTrue,
        reason: 'google-services.json não encontrado — rode o teste a partir '
            'da raiz do app (nexago_app/).');

    final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    final clients = (json['client'] as List).cast<Map<String, dynamic>>();
    final oauthClients = clients
        .expand((c) => (c['oauth_client'] as List? ?? const []))
        .cast<Map<String, dynamic>>();

    final webClientIds = oauthClients
        .where((c) => c['client_type'] == 3)
        .map((c) => c['client_id'] as String)
        .toSet();

    expect(webClientIds, isNotEmpty,
        reason: 'Nenhum OAuth client web (client_type 3) no '
            'google-services.json — baixe o arquivo de novo via '
            '`firebase apps:sdkconfig ANDROID`.');
    expect(webClientIds, contains(AuthService.firebaseWebClientId),
        reason: 'AuthService.firebaseWebClientId não é o Web client do '
            'projeto. Ids de outro tipo quebram o login com Google no '
            'Android (ApiException: 10).');
  });
}
