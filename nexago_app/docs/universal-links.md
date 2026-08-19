# Universal Links / App Links do app

Domínio em uso: **`atleta.nexago.com.br`** (Firebase Hosting, target `athlete`).

Foi escolhido por ser o único domínio do projeto que resolve DNS e responde
HTTPS hoje. Os outros dois que o app declara estão quebrados: `nexago.app`
**não está registrado** (NXDOMAIN) e `voleigo.com.br` resolve mas não responde
HTTPS — enquanto continuarem assim, nenhum link para eles abre o app.

## O que o app reivindica

Só o prefixo `/convite-dupla` — reivindicar o host inteiro faria toda a web do
portal do atleta abrir no app.

| Onde | Arquivo |
| --- | --- |
| iOS | `nexago_app/ios/Runner/Runner.entitlements` e `RunnerDebug.entitlements` (`applinks:atleta.nexago.com.br`) |
| Android | `nexago_app/android/app/src/main/AndroidManifest.xml` (intent-filter `autoVerify`, `pathPrefix="/convite-dupla"`) |
| Dart | `nexago_app/lib/core/deep_link/app_deep_link_logic.dart` (`kAppDeepLinkHosts` + `resolveAppDeepLinkPath`) |

## Arquivos de associação

Ficam em `frontend/projects/athlete/public/.well-known/` e o build do Angular
os copia para `dist/athlete/browser/` (o glob de `assets` já cobre `public/**/*`).

- `apple-app-site-association` — **sem extensão**. O `firebase.json` força
  `Content-Type: application/json` nesse path; a Apple recusa outro tipo e
  também recusa redirect.
- `assetlinks.json` — fingerprints SHA-256 das chaves de assinatura.

O rewrite catch-all (`** → /index.html`) do target não atrapalha: o Firebase
Hosting serve arquivo estático antes de aplicar rewrite.

## Pendente para funcionar em instalações da Play Store

`assetlinks.json` traz hoje os fingerprints do **debug keystore** e do **upload
keystore**. Falta o SHA-256 da chave do **Play App Signing** (Play Console →
Integridade do app → Assinatura de apps). Sem ele, o Android não verifica o App
Link para quem instalou pela loja — o link abre o navegador em vez do app.
Mesma pendência que já bloqueava o login Google no Android.

## Como conferir depois do deploy

```bash
curl -sI https://atleta.nexago.com.br/.well-known/apple-app-site-association
curl -s  https://atleta.nexago.com.br/.well-known/assetlinks.json
```

Esperado: HTTP 200, `content-type: application/json`, sem redirect.
