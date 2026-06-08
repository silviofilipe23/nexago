# iOS — Reenvio após rejeição 5.1.2(i) (Rastreamento)

Guia operacional para corrigir a rejeição **Guideline 5.1.2(i)**. O app NexaGO **não rastreia** usuários (sem ATT, sem SDK de ads/analytics). A causa foi rótulo incorreto no App Store Connect.

## 1. Corrigir Privacy Nutrition Labels (App Store Connect)

**Caminho:** App Store Connect → Apps → NexaGO → **Privacidade do app** (App Privacy)

### 1.1 Pergunta principal

**“Você ou seus parceiros usam dados para rastrear?”** → **Não**

### 1.2 Por tipo de dado

Remover **“Used for Tracking”** de **todos** os tipos. Marcar apenas finalidades de funcionalidade:

| Dado | Categoria | Finalidades | Tracking |
|------|-----------|-------------|----------|
| E-mail | Informações de contato | Funcionalidade do app, Gerenciamento de conta | **Não** |
| Nome | Informações de contato | Funcionalidade do app | **Não** |
| Fotos / vídeos (avatar) | Fotos ou vídeos | Funcionalidade do app | **Não** |
| ID do usuário | ID do usuário | Funcionalidade do app | **Não** |
| Localização aproximada | Localização | Funcionalidade do app | **Não** |
| ID do dispositivo (FCM) | ID do dispositivo | Funcionalidade do app | **Não** |

**Não marcar:** Publicidade de terceiros, Publicidade do desenvolvedor, Analytics (não há Firebase Analytics no app).

### 1.3 URL da política de privacidade

Em **Informações do app**, definir:

- **Política de privacidade:** `https://nexago.app/privacidade`

Salvar e aguardar propagação (alguns minutos).

---

## 2. Resposta no Resolution Center

Responder à mensagem de rejeição **antes** de reenviar o build (copiar e colar em português ou inglês):

**Português:**

> O app NexaGO não realiza rastreamento cross-app ou cross-site. A declaração anterior de “Used for Tracking” para e-mail foi incorreta. O e-mail é coletado exclusivamente para autenticação e gestão de conta (Firebase Authentication). Atualizamos as Informações de Privacidade do App removendo tracking. O app não utiliza App Tracking Transparency porque não rastreia usuários conforme a definição da Apple. Política de privacidade: https://nexago.app/privacidade

**English (optional):**

> NexaGO does not track users across apps or websites. Our App Privacy labels incorrectly indicated email was used for tracking. Email is collected solely for authentication and account management (Firebase Auth). We updated App Privacy to remove all tracking declarations. The app does not use App Tracking Transparency because we do not track users as defined by Apple. Privacy policy: https://nexago.app/privacidade

---

## 3. App Review Notes (próximo envio)

**Caminho:** App Store Connect → versão em revisão → **Informações para a equipe de revisão**

```
Privacy / Tracking (Guideline 5.1.2):

- NexaGO does NOT track users. No App Tracking Transparency prompt is shown because tracking is not performed.
- App Privacy labels were corrected: tracking = No; email is used for account login only (Firebase Auth).
- Privacy policy: https://nexago.app/privacidade
- Terms: https://nexago.app/termos
- Account deletion: https://nexago.app/excluir-conta

Where reviewers can see email collection:
- Open app → "Entrar" / "Criar conta" → email + password fields on login/register screens.

Test account (if applicable):
- Email: [PREENCHER]
- Password: [PREENCHER]

No third-party advertising or analytics SDKs are integrated. Firebase Analytics is disabled (IS_ANALYTICS_ENABLED = false).
```

Substituir credenciais de teste se fornecidas à Apple.

---

## 4. Reenvio do build

1. Confirmar `version` em `nexago_app/pubspec.yaml` (build incrementado, ex.: `1.0.0+9`).
2. Gerar IPA release e enviar via Xcode ou Transporter.
3. Associar o build à versão e submeter para revisão.
4. Colar as **Review Notes** acima.
5. Confirmar que a URL da política abre no navegador.

---

## 5. Checklist final

- [ ] App Privacy: **Tracking = Não**
- [ ] E-mail sem flag de tracking
- [ ] Resposta enviada no Resolution Center
- [ ] `https://nexago.app/privacidade` publicada
- [ ] Review Notes preenchidas
- [ ] Novo build enviado
