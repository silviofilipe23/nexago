# Push notifications no iOS — guia completo (NexaGO)

Este guia cobre **tudo** que é necessário para push (FCM/APNs) funcionar no iPhone/iPad do NexaGO, além do que já existe no app (inbox in-app, Cloud Functions, token FCM).

**Bundle ID:** `br.com.nexago.nexagoApp`  
**Firebase project:** `volley-track-dev-4596c`  
**Team ID (Xcode):** `2S4HRY66UA`

---

## Visão geral: o que já existe vs o que falta

| Camada | Status no código | Observação |
|--------|------------------|------------|
| Inbox in-app (`users/{uid}/notifications`) | ✅ Implementado | Funciona sem push nativo |
| Cloud Functions (`deliverNotificationToUser`) | ✅ Implementado | Envia FCM + grava inbox |
| App Flutter (`NotificationService`, token sync) | ✅ Implementado | Aguarda token APNS no iOS |
| Android (`POST_NOTIFICATIONS`, `google-services.json`) | ✅ Configurado | Push tende a funcionar |
| iOS entitlements (`aps-environment`) | ⚠️ Ver seção 2 | Adicionado no repo; exige perfil Apple |
| iOS `UIBackgroundModes` | ⚠️ Ver seção 2 | `remote-notification` adicionado |
| Apple Developer — Push capability | ❌ Manual | Habilitar no portal / Xcode |
| Firebase Console — chave APNs (.p8) | ❌ Manual | Obrigatório para FCM → iOS |

---

## 1. Apple Developer (developer.apple.com)

### 1.1 App ID com Push Notifications

1. Acesse [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. Abra o App ID **`br.com.nexago.nexagoApp`** (ou crie se não existir).
3. Em **Capabilities**, marque **Push Notifications**.
4. Salve.

> Sem isso, o provisioning profile **não** inclui entitlement de push e o build falha ou o APNS token não é emitido.

### 1.2 Chave APNs (.p8) — recomendado (funciona dev + produção)

1. **Keys** → **+** → nome ex.: `NexaGO APNs`.
2. Marque **Apple Push Notifications service (APNs)**.
3. Baixe o arquivo `.p8` (**só pode baixar uma vez**).
4. Anote:
   - **Key ID** (ex.: `AB12CD34EF`)
   - **Team ID** (`2S4HRY66UA`)

Guarde o `.p8` em local seguro (1Password / secrets do time). **Não commite** no repositório.

### 1.3 Regenerar provisioning profiles (se push foi habilitado depois)

1. **Profiles** → edite ou recrie os profiles de **Development** e **App Store / Distribution** para `br.com.nexago.nexagoApp`.
2. Confirme que o App ID listado inclui Push Notifications.
3. Baixe/instale ou deixe o Xcode com **Automatically manage signing** (recomendado).

---

## 2. Projeto iOS no repositório (já aplicado)

### 2.1 Entitlements

- **Debug:** `ios/Runner/RunnerDebug.entitlements` → `aps-environment` = `development`
- **Release / Profile / IPA:** `ios/Runner/Runner.entitlements` → `aps-environment` = `production`

Ambos mantêm **Associated Domains** (`applinks:voleigo.com.br`).

### 2.2 Info.plist

`UIBackgroundModes` inclui `remote-notification` para receber push em background e permitir que o FCM processe mensagens silenciosas quando aplicável.

### 2.3 Xcode (validação local)

1. Abra `nexago_app/ios/Runner.xcworkspace`.
2. Target **Runner** → **Signing & Capabilities**.
3. Confirme:
   - **Push Notifications** (se não aparecer, clique **+ Capability**).
   - **Background Modes** → **Remote notifications** (deve espelhar o Info.plist).
   - **Associated Domains** → `applinks:voleigo.com.br`.
4. **Signing:** Team `2S4HRY66UA`, bundle `br.com.nexago.nexagoApp`.

> Ao adicionar Push no Xcode, ele pode reescrever entitlements — confira que `aps-environment` permanece coerente (dev vs prod).

---

## 3. Firebase Console

### 3.1 Upload da chave APNs

1. [Firebase Console](https://console.firebase.google.com/) → projeto **volley-track-dev-4596c**.
2. **Project settings** (engrenagem) → aba **Cloud Messaging**.
3. Em **Apple app configuration**, selecione o app iOS `br.com.nexago.nexagoApp`.
4. **Upload** da chave APNs:
   - Arquivo `.p8`
   - **Key ID**
   - **Team ID** (`2S4HRY66UA`)
5. Salve.

Sem este passo, o backend envia FCM mas a Apple **rejeita** a entrega para iOS (tokens inválidos / erros no Firebase).

### 3.2 Conferir app iOS registrado

Em **Project settings → Your apps**, o iOS app deve ter:

- Bundle ID: `br.com.nexago.nexagoApp`
- `GoogleService-Info.plist` no repo (`nexago_app/ios/Runner/GoogleService-Info.plist`) com `IS_GCM_ENABLED` = true ✅

---

## 4. Backend (Cloud Functions)

Já implementado em `functions/src/notification-delivery.ts`:

- Lê tokens em `users/{userId}/tokens/*`
- Envia via Firebase Admin `getMessaging().send()`
- Grava histórico em `users/{userId}/notifications`

**Deploy** (se alterou functions):

```bash
cd functions
npm run build
firebase deploy --only functions
```

Eventos que disparam push hoje:

| Tipo | Origem |
|------|--------|
| `tournament_partner_invite` | Convite de dupla em torneio |
| `tournament_partner_invite_accepted` | Parceiro aceitou convite |
| `tournament_registration_confirmed` | Pagamento da inscrição concluído |
| `booking_invite` | Convite para reserva |
| Lembrete 15 min | `arena-booking-reminder-15m` |
| `slot_vacancy_available` | Vaga em horário (opt-in) |

---

## 5. App Flutter — fluxo do token

1. `main.dart` inicializa `NotificationService` e pede permissão (`requestPermission`).
2. Após login, `syncUserToken(uid)` grava em Firestore:
   ```
   users/{uid}/tokens/{installationId}
     token: "<fcm-token>"
     platform: "ios" | "android"
   ```
3. No iOS, se APNS ainda não estiver pronto, o sync é adiado (log: *APNS token ainda não disponível*).

**Preferências:** `users/{uid}.notificationPreferences.channels.push` — se `false`, o app não sincroniza token.

---

## 6. Teste end-to-end

### 6.1 Dispositivo físico (simulador iOS **não** recebe push remoto)

1. Build Release ou TestFlight (push de produção) **ou** Debug com profile Development.
2. Instale, faça login, aceite permissão de notificações.
3. Firestore → `users/{seu-uid}/tokens` → deve existir documento com `platform: ios` e `token` preenchido.
4. Dispare um evento real (ex.: convite de torneio para outro usuário) **ou** envie teste pelo Firebase Console:
   - **Engage → Messaging → New campaign → Firebase Notification messages**
   - Target: FCM registration token (copiado do Firestore)

### 6.2 Checklist de falhas comuns

| Sintoma | Causa provável |
|---------|----------------|
| Sem doc em `users/.../tokens` | Permissão negada, não logado, ou APNS indisponível |
| Token existe, push não chega | Chave APNs não uploadada no Firebase |
| Funciona em Android, não no iOS | Push capability / entitlements / profile Apple |
| Só inbox, sem banner | Push falhou mas `deliverNotificationToUser` gravou inbox |
| App aberto, sem banner iOS | Esperado parcialmente; iOS pode mostrar via `setForegroundNotificationPresentationOptions` |
| App aberto Android, sem banner | Foreground não usa `flutter_local_notifications` (melhoria futura) |
| TestFlight OK, Debug device falha | Profile Development vs `aps-environment` development |

### 6.3 Logs úteis (Xcode / `flutter run`)

```
FCM permission: authorized
APNS token ainda não disponível  → push ainda não configurado no device/profile
FCM aguardando APNS token no iOS
FCM plugin indisponível          → hot restart quebrou canal nativo; cold start
```

---

## 7. App Store Connect — privacidade

Ao declarar dados coletados, o **ID do dispositivo (FCM)** entra como:

- **Finalidade:** Funcionalidade do app (notificações de convites, reservas, torneios)
- **Tracking:** Não

Referência: [ios-privacy-resubmission.md](./app-store/ios-privacy-resubmission.md).

---

## 8. Melhorias futuras (opcional)

1. **`flutter_local_notifications`** — banner quando o app está em foreground (Android + iOS).
2. **Respeitar `pushEnabled` no backend** para todos os tipos (hoje convites de torneio sempre tentam push).
3. **Canal WhatsApp/e-mail** — UI de preferências existe; envio automático ainda não.
4. **Retry de sync APNS** — re-tentar `syncUserToken` quando `getAPNSToken()` ficar disponível (timer ou listener).

---

## 9. Ordem recomendada de execução

1. ✅ Código iOS no repo (entitlements + background mode + `CODE_SIGN_ENTITLEMENTS`)
2. Apple Developer → Push no App ID + chave `.p8`
3. Firebase Console → upload APNs key
4. Xcode → validar capabilities + signing
5. `flutter build ipa` ou Archive → TestFlight
6. Teste em dispositivo físico + verificar Firestore `tokens`
7. Teste evento real (convite torneio/reserva)

---

## Referências no código

| Arquivo | Papel |
|---------|--------|
| `nexago_app/lib/core/notifications/notification_service.dart` | Permissão, token, Firestore |
| `nexago_app/lib/core/notifications/notification_navigation.dart` | Deep link ao tocar push |
| `nexago_app/lib/main.dart` | Inicialização FCM |
| `functions/src/notification-delivery.ts` | Envio FCM + inbox |
| `nexago_app/ios/Runner/Runner.entitlements` | Push produção |
| `nexago_app/ios/Runner/RunnerDebug.entitlements` | Push desenvolvimento |
