# nexago_app

App Flutter do nexaGO — torneios, ligas e arenas de esportes de areia.

Requer Flutter 3.44+ (canal `stable`). Todos os comandos abaixo rodam de dentro
de `nexago_app/`.

## Os dois tokens do Mapbox

São tokens diferentes, com destinos diferentes. Confundir os dois é o erro mais
comum aqui.

| | `pk.*` (público) | `sk.*` (secreto, DOWNLOADS:READ) |
|---|---|---|
| Serve para | o app desenhar o mapa em runtime | Gradle/CocoaPods baixarem o SDK nativo |
| Entra por | `--dart-define`, a cada `run`/`build` | configuração da máquina que compila |
| Se faltar | release **não compila**; debug roda sem mapa | build falha na hora |

### `pk.*` — token de runtime

Copie o exemplo e cole o token:

```bash
cp dart_defines.example.json dart_defines.json
```

`dart_defines.json` é ignorado pelo git; `dart_defines.example.json` é
versionado e serve só de molde.

### `sk.*` — token de download

Uma vez por máquina que compila (a sua e, no futuro, a de CI):

- **Android** — `~/.gradle/gradle.properties`:
  ```
  MAPBOX_DOWNLOADS_TOKEN=sk.seu_token
  ```
  (ou a variável de ambiente de mesmo nome — ver `android/build.gradle.kts`)
- **iOS** — `~/.netrc`:
  ```
  machine api.mapbox.com
    login mapbox
    password sk.seu_token
  ```

## Rodando

```bash
flutter run --dart-define-from-file=dart_defines.json
```

No VS Code, use as configurações `nexaGO (debug|profile|release)` — elas já
apontam para o arquivo.

Sem o token o app **sobe normalmente**, só que a busca de arenas cai no fallback
em lista, sem mapa (`lib/core/map/mapbox_config.dart`).

## Gerando uma versão

1. Suba a versão em `pubspec.yaml` (`version: <nome>+<build>`). O número depois
   do `+` precisa ser maior que o da última subida em cada loja.
2. Compile **sempre com o `--dart-define-from-file`** — é o mesmo parâmetro do
   `run`, e é aqui que ele é fácil de esquecer:

```bash
flutter build appbundle --release --dart-define-from-file=dart_defines.json
```

```bash
flutter build ipa --release --dart-define-from-file=dart_defines.json
```

Esquecer o token aqui **não passa despercebido**: há uma trava de compilação em
`lib/core/map/mapbox_config.dart` que derruba qualquer build de release sem
`MAPBOX_ACCESS_TOKEN`, com a mensagem dizendo o que fazer. Ela existe porque um
AAB sem token é idêntico a um com token até o atleta abrir a tela — sem a trava,
o erro só apareceria depois de publicado.

## Testes

```bash
flutter test
```

Os testes rodam sem token de propósito: é o que mantém o `MapWidget` (uma view
de plataforma) fora dos widget tests.
