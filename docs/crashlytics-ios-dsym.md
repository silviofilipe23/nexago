# Crashlytics no iOS: dSYMs

## Por que o iOS não tinha nenhum evento

O `firebase_crashlytics` entrou no app em 18/06/2026, dez dias depois da migração
dos plugins para Swift Package Manager. A fase do Xcode que envia os dSYMs ao
Crashlytics é instalada pelo **podspec** do plugin (`crashlytics_add_upload_symbols`),
ou seja, só existe com CocoaPods. Com SPM ela nunca foi criada, e nenhum build da loja
enviou dSYM.

O SDK funciona: em 04/11/2026 uma sonda no simulador gravou um não-fatal via
`recordFlowError` e o log do SDK mostrou `Packaged report ... Completed report
submission`. O relatório sai do aparelho; o que falta é o dSYM do binário para o
Crashlytics processar o evento. Sem ele o painel e a API (`reports/topIssues`)
ficam vazios, enquanto o Android (que não precisa de dSYM) mostra tudo.

## O que o projeto faz agora

A última fase do target `Runner` é `[Crashlytics] Upload dSYMs`. Em Profile e
Release ela chama `upload-symbols` (do checkout SPM do `firebase-ios-sdk`) com
`${DWARF_DSYM_FOLDER_PATH}`, que envia todos os dSYMs do build: `Runner.app`,
`App.framework` (o código Dart) e `Flutter.framework`. Em Debug sai sem fazer
nada. Ela procura a ferramenta em `build/ios/SourcePackages` (`flutter build ipa`)
e em `DerivedData/.../SourcePackages` (archive pelo Xcode). Se não achar ou o
envio falhar, o build mostra um `warning:`. Ela nunca quebra o build.

## Enviar os dSYMs de um build antigo

Os eventos de builds que já estão na loja só aparecem depois que o dSYM daquele
build sobe. O archive do `flutter build ipa` fica em
`nexago_app/build/ios/archive/Runner.xcarchive` (no checkout que gerou o build),
e os do Xcode ficam em `~/Library/Developer/Xcode/Archives`.

```bash
cd nexago_app
build/ios/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/upload-symbols \
  -gsp ios/Runner/GoogleService-Info.plist -p ios \
  "<caminho>/Runner.xcarchive/dSYMs"
```

Para conferir se o build tem dSYM, compare o UUID do binário com o do dSYM
(`dwarfdump --uuid`). Os dSYMs enviados aparecem no console em Crashlytics → dSYMs.
