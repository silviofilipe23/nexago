# Dados cadastrais da arena — deploy

Tela nova no portal arena (`/painel/perfil/cadastro`): CNPJ/razão social da empresa e endereço
estruturado com CEP e coordenada. Antes disso o CNPJ era pedido no cadastro e descartado, e o
endereço era uma linha de texto livre — sem coordenada, a arena não aparecia no mapa do app.

## Ordem

### 1. Secret do Mapbox (antes das functions)

`geocodeAddress` declara o secret `MAPBOX_ACCESS_TOKEN`. **Sem ele o deploy das functions
falha** pedindo o valor.

```bash
cd functions && npx firebase functions:secrets:set MAPBOX_ACCESS_TOKEN --project volley-track-dev-4596c
```

Use um token do Mapbox com escopo de Geocoding. É o mesmo produto que o app usa via
`--dart-define=MAPBOX_ACCESS_TOKEN`, mas o token aqui fica no Secret Manager e nunca no cliente.

### 2. Functions

```bash
cd functions && npm run deploy:changed
```

Sobem: `geocodeAddress` (nova), `completeArenaSignup` (passa a gravar o CNPJ do formulário em
`arenas/{id}/registration/data`) e o caminho do Asaas, que agora procura o documento nessa
subcoleção antes dos campos legados.

### 3. Rules

```bash
npx firebase deploy --only firestore:rules --project volley-track-dev-4596c
```

Libera `arenas/{arenaId}/registration/{docId}`: leitura e escrita só do titular (e admin). A
subcoleção existe porque `arenas/{arenaId}` é `allow read: if true` — CNPJ, e principalmente o
CPF de arena de autônomo, não podem ficar no doc público.

### 4. Portal arena

```bash
cd frontend && npm run build:arena
```

## Se o secret não estiver configurado

`geocodeAddress` devolve `{coords: null}`: o cadastro salva normalmente, sem coordenada, e a
tela avisa que não conseguiu posicionar a arena no mapa. Nada trava.

## Arenas que já existem

Nenhuma migração. O endereço antigo (`address`, texto livre) continua sendo lido e aparece na
tela como referência para o gestor refazer pelos campos novos. O `address` segue sendo gravado —
derivado das partes — porque app, site e mini-site leem essa linha.

## Ponta solta conhecida

`ArenaProfileEditService` (Flutter, `arena_edit_profile_page.dart`) ainda grava `address` em
texto livre e não conhece `addressParts`. Uma edição pelo app deixa os dois campos divergentes;
o portal detecta isso na leitura (a linha gravada não bate com as partes), descarta as partes e
trata o endereço como legado. Ensinar o app a gravar as partes fica para uma próxima.
