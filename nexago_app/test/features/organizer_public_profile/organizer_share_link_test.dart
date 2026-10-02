import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/deep_link/app_deep_link_logic.dart';
import 'package:nexago_app/core/deep_link/app_domains.dart';

void main() {
  test('link do perfil do organizador aponta para o portal do atleta', () {
    expect(
      AppShareLinks.organizerProfile('org-1'),
      'https://atleta.nexago.com.br/organizadores/org-1',
    );
  });

  test('o app não intercepta /organizadores (abre o portal, de propósito)', () {
    expect(
      resolveAppDeepLinkPath(
        Uri.parse(AppShareLinks.organizerProfile('org-1')),
      ),
      isNull,
    );
  });
}
