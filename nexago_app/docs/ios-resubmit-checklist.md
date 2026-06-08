# Build iOS para reenvio (5.1.2)

Versão atual: **1.0.0+9** (`pubspec.yaml`).

## Comandos

```bash
cd nexago_app
flutter pub get
flutter build ipa --release
```

Ou abrir `ios/Runner.xcworkspace` no Xcode → Product → Archive → Distribute App.

## Antes de submeter

1. Seguir [ios-privacy-resubmission.md](../../../docs/app-store/ios-privacy-resubmission.md)
2. Publicar site com rotas `/privacidade` e `/termos` (Firebase Hosting / deploy do frontend)
3. Confirmar `PrivacyInfo.xcprivacy` no target Runner (já incluído no projeto)
4. Push notifications iOS: [ios-push-notifications-setup.md](../../../docs/ios-push-notifications-setup.md)

## Review Notes

Copiar de `docs/app-store/ios-privacy-resubmission.md` seção 3.
