# Universal Links / App Links do app

Domínio em uso: **`atleta.nexago.com.br`** (Firebase Hosting, target `athlete`).

Foi escolhido por ser o único domínio do projeto que resolve DNS e responde
HTTPS hoje. Os outros dois que o app declara estão quebrados: `nexago.app`
**não está registrado** (NXDOMAIN) e `voleigo.com.br` resolve mas não responde
HTTPS — enquanto continuarem assim, nenhum link para eles abre o app.

## O que o app reivindica

Só prefixos de convite — reivindicar o host inteiro faria toda a web do portal
do atleta abrir no app.

| Prefixo | Para quê |
| --- | --- |
| `/convite-dupla/:id` | Convite para parceiro **sem conta**: leva ao cadastro e, no fim dele, ao convite. |
| `/torneios-convite/:id` | Convite **já criado**, compartilhado para cutucar quem ainda não respondeu. |
| `/convite/:id` | Convite para jogar numa **reserva de quadra**: `{bookingId}_{uid}` (direto) ou `link_{bookingId}` (link multiuso, até lotar). O Android já reivindicava desde o 1.0.1; o iOS passou a reivindicar em 19/10/2026. |

O `:id` do `/convite-dupla` é o **token** do convite externo — o id de um doc
em `tournamentExternalPartnerInvites`, aleatório e não adivinhável. Uso único e
expiração de 7 dias são as travas: quem receber o link encaminhado e resgatar
primeiro vira o convidado, e por isso o convite continua exigindo aceite e
podendo ser cancelado por quem convidou.

### Sem o app, o portal atende

App/Universal Link só dispara ao **tocar** num link vindo de outro app
(WhatsApp, Mensagens). Link digitado ou colado na barra do navegador nunca abre
o app — e quem não tem o app instalado também cai no navegador. Por isso os três
prefixos têm rota no portal do atleta (`frontend/projects/athlete/src/app/convite/`):

- `/convite-dupla/:id` — sem sessão vai para o **cadastro** (`signupFirstGuard`),
  com o link em `?redirect=` e `ref`/`de` repassados; depois do onboarding,
  "Entrar na dupla" resgata o token (`claimExternalPartnerInvite`) e segue para
  `/torneios-convite/:id`.
- `/torneios-convite/:id` — abre o modal de resposta do portal (o mesmo do
  anúncio automático, com termo LGPD e confirmação de nível) por cima do estado
  do convite.
- `/convite/:id` — aceite/recusa do convite de reserva.

Até 27/10/2026 os dois primeiros caíam no `**` da SPA (painel/login) e o convite
se perdia.

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

## Digitais do Android

`assetlinks.json` traz o SHA-256 do **debug keystore**, do **upload keystore** e,
desde 27/10/2026, da chave do **Play App Signing** (`6A:5D:5A:…:E2:02`, a mesma
registrada no Firebase — `firebase apps:android:sha:list`). Sem a do Play App
Signing o Android não verifica o App Link para quem instalou pela loja (a loja
reassina o app com ela) e o link abre o navegador em vez do app.

O portal é servido pela Hostinger (upload manual), não pelo Firebase Hosting:
mudança nestes arquivos só vale depois de subir o build do portal.

## Como conferir depois do deploy

```bash
curl -sI https://atleta.nexago.com.br/.well-known/apple-app-site-association
curl -s  https://atleta.nexago.com.br/.well-known/assetlinks.json
```

Esperado: HTTP 200, `content-type: application/json`, sem redirect.
