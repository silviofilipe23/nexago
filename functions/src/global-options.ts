import {setGlobalOptions} from "firebase-functions";
import {DEFAULT_REGION} from "./function-regions";

/**
 * Opções globais de TODAS as funções.
 *
 * Mora num módulo separado por uma razão de ordem: `setGlobalOptions` só vale
 * para funções definidas DEPOIS da chamada, e `import` vira `require` no topo
 * do arquivo compilado. Enquanto isso ficou no meio do `index.ts`, todo módulo
 * de função já tinha sido carregado — e definido seus endpoints — antes de a
 * configuração existir. Na prática o `maxInstances` não valia para nada.
 *
 * Este módulo é o PRIMEIRO import do `index.ts`. Mantenha-o lá.
 */
setGlobalOptions({
  // Teto de contêineres simultâneos — controle de custo.
  maxInstances: 10,
  // A casa é a região do Firestore. Gatilhos e agendadas herdam daqui; quem tem
  // cliente do outro lado sobrescreve com as duas regiões da travessia
  // (`function-regions.ts`).
  region: DEFAULT_REGION,
});
