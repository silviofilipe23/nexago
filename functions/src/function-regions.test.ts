import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {readdirSync} from "node:fs";
import {join} from "node:path";
// Antes de qualquer coleta: é isto que o `index.ts` faz, e a região dos
// gatilhos depende de a chamada acontecer antes de a função ser definida.
import "./global-options";
import {CLIENT_FACING_REGIONS, DEFAULT_REGION} from "./function-regions";

/**
 * A política de região, verificada no artefato compilado — não no texto do
 * código. O que importa é o `__endpoint` que o deploy lê; um `region` escrito
 * no lugar errado passa por qualquer grep e não chega lá.
 */

interface Endpoint {
  region?: unknown;
  maxInstances?: unknown;
  callableTrigger?: unknown;
  httpsTrigger?: unknown;
  eventTrigger?: unknown;
  scheduleTrigger?: unknown;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    // `index.js` fica de fora: importá-lo roda `initializeApp()`.
    else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js") && e.name !== "index.js") {
      out.push(p);
    }
  }
  return out;
}

/** Todo endpoint exportado pelo bundle, por nome. */
function collectEndpoints(): Map<string, Endpoint> {
  const found = new Map<string, Endpoint>();
  for (const file of walk(__dirname)) {
    let mod: Record<string, unknown>;
    try {
      mod = require(file) as Record<string, unknown>;
    } catch {
      continue; // módulo que precisa de credencial para carregar não é endpoint
    }
    for (const [name, value] of Object.entries(mod)) {
      const endpoint = (value as {__endpoint?: Endpoint})?.__endpoint;
      if (endpoint) found.set(name, endpoint);
    }
  }
  return found;
}

const ENDPOINTS = collectEndpoints();

const clientFacing = (e: Endpoint): boolean =>
  e.callableTrigger !== undefined || e.httpsTrigger !== undefined;

describe("política de região", () => {
  it("a casa é a mesma região do Firestore", () => {
    assert.equal(DEFAULT_REGION, "southamerica-east1");
  });

  it("São Paulo é o destino, us-central1 é a ponte", () => {
    assert.equal(CLIENT_FACING_REGIONS[0], DEFAULT_REGION);
    assert.ok(
      CLIENT_FACING_REGIONS.includes("us-central1"),
      "apagar Iowa antes da hora derruba o app publicado e os webhooks",
    );
  });

  it("o bundle expõe os endpoints esperados", () => {
    assert.ok(ENDPOINTS.size > 150, `só ${ENDPOINTS.size} endpoints carregaram`);
  });
});

describe("callables e endpoints HTTP atendem nas duas regiões", () => {
  const names = [...ENDPOINTS].filter(([, e]) => clientFacing(e)).map(([n]) => n).sort();

  it("há callables e endpoints HTTP para checar", () => {
    assert.ok(names.length > 150, `só ${names.length} endpoints com cliente`);
  });

  for (const name of names) {
    it(name, () => {
      assert.deepEqual(
        ENDPOINTS.get(name)!.region,
        CLIENT_FACING_REGIONS,
        `${name} tem cliente do outro lado e precisa das duas regiões`,
      );
    });
  }
});

describe("gatilhos e agendadas ficam em São Paulo pelo padrão global", () => {
  const names = [...ENDPOINTS].filter(([, e]) => !clientFacing(e)).map(([n]) => n).sort();

  it("há gatilhos e agendadas para checar", () => {
    assert.ok(names.length > 40, `só ${names.length} gatilhos/agendadas`);
  });

  for (const name of names) {
    it(name, () => {
      // Ninguém os chama por região — quem dispara é o próprio Firestore e o
      // Cloud Scheduler. Vão direto para a casa, sem ponte.
      assert.deepEqual(ENDPOINTS.get(name)!.region, [DEFAULT_REGION]);
    });
  }
});

describe("o teto de instâncias vale de verdade", () => {
  it("chega em todo endpoint, não só nos definidos após a chamada", () => {
    const semTeto = [...ENDPOINTS]
      .filter(([, e]) => (e as {maxInstances?: unknown}).maxInstances !== 10)
      .map(([n]) => n);
    assert.deepEqual(semTeto, [], "setGlobalOptions rodou tarde demais");
  });
});
