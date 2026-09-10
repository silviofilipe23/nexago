import 'package:cloud_functions/cloud_functions.dart';

/// Região das Cloud Functions.
///
/// O Firestore do projeto vive em `southamerica-east1`, mas
/// `FirebaseFunctions.instance` pede a callable em `us-central1` — o padrão do
/// SDK. Nesse arranjo cada chamada feita do Brasil sobe até Iowa, lê o banco em
/// São Paulo e desce de volta: uma ida e volta de ~130 ms por leitura, em cima
/// de ~200 ms só para alcançar a função.
const kFunctionsRegion = 'southamerica-east1';

/// A instância que TODA feature deve usar — nunca `FirebaseFunctions.instance`,
/// que silenciosamente volta para Iowa.
///
/// As functions atendem nas duas regiões durante a travessia
/// (`functions/src/function-regions.ts`), então uma versão antiga do app
/// instalada por aí continua funcionando enquanto esta sobe para a loja.
FirebaseFunctions get nexagoFunctions =>
    FirebaseFunctions.instanceFor(region: kFunctionsRegion);
