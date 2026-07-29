# Atualização obrigatória do app

Como forçar a base instalada a subir de versão, e o que o mecanismo **não**
consegue fazer.

## Como funciona

O app lê `appConfig/appVersion` no Firestore em tempo real. Se o build number
instalado for menor que o `minBuildNumber` da plataforma, o app inteiro é
substituído por uma tela de bloqueio com um único botão, que leva à loja.

- Gate: `nexago_app/lib/core/app_update/`
- Plugado em `main.dart` acima de tudo (router e gate biométrico) — bloqueado,
  nenhuma rota chega a ser construída.
- Como é um stream, dá para **ligar e desligar o bloqueio sem publicar app novo**.

### Fail-open por contrato

Doc ausente, leitura negada, JSON malformado, offline sem cache, versão do
binário ilegível — tudo isso resulta em "não bloqueia". Um falso positivo aqui
trancaria a base inteira fora do app, então o default seguro é sempre deixar
passar. Coberto por `test/core/app_update/app_update_config_test.dart`.

### Documento

```
appConfig/appVersion {
  android: { minBuildNumber: 101, storeUrl?, title?, message? },
  ios:     { minBuildNumber: 0,   storeUrl?, title?, message? }
}
```

`minBuildNumber` é o **build number** (o `+N` do pubspec / versionCode), não o
versionName. Só escrita por admin — as rules bloqueiam escrita do cliente.
Leitura é pública (sem auth) de propósito: o bloqueio precisa valer também na
tela de login.

## A limitação que importa

O gate só funciona em builds que já trazem o código do gate — ou seja, **1.0.6
(build 101) em diante**. A base instalada anterior (build 100 e abaixo) não tem
o que checar e nunca vai ver a tela de bloqueio, por mais que o doc esteja
configurado. Não existe forma de bloquear retroativamente um app que não tem
código de checagem.

Para essa base antiga, o único empurrão disponível é push:

```bash
node scripts/notify-outdated-app-users.js --project <projectId>            # dry-run
node scripts/notify-outdated-app-users.js --project <projectId> --uid <seuUid> --yes
node scripts/notify-outdated-app-users.js --project <projectId> --yes     # disparo geral
```

O script não sabe a versão de cada instalação (o app não grava isso em
`users/{uid}/tokens`), então ele avisa todo mundo da plataforma — inclusive
quem já atualizou. A partir de 101, o gate resolve sozinho e este script vira
apenas um lembrete opcional.

## Rollout

A ordem importa: apertar o número antes de o build estar disponível na loja
tranca a base sem ter para onde ir.

1. **Publicar** o AAB (build 101) na Play Store e esperar ficar disponível.
2. **Conferir** o estado atual:
   ```bash
   node scripts/set-min-app-version.js --project <projectId> --show
   ```
3. **Ligar** o bloqueio (dry-run primeiro, sem `--yes`):
   ```bash
   node scripts/set-min-app-version.js --project <projectId> --platform android --min 101 --yes
   ```
4. **Verificar** em um device com a versão antiga que a tela aparece e o botão
   leva à loja.

Rodar com `--platform android` não mexe no bloco `ios`.

### Desligar

```bash
node scripts/set-min-app-version.js --project <projectId> --platform android --min 0 --yes
```

Vale ao vivo, sem publicar app novo. É a saída de emergência se o bloqueio
subir errado.

## Nas próximas versões

Basta subir o `minBuildNumber` depois que o build novo estiver na loja. O
código do gate não precisa mudar.
