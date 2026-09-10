#!/usr/bin/env node
/**
 * Deploy faseado da migração de região (ver `src/function-regions.ts`).
 *
 * As duas fases têm riscos diferentes e não devem ir juntas:
 *
 *   clientes  callables e endpoints HTTP. Ganham `southamerica-east1` SEM
 *             perder `us-central1` — é aditivo, nada para de funcionar. Pode
 *             rodar a qualquer hora.
 *
 *   gatilhos  gatilhos do Firestore e agendadas. MUDAM de região, e região não
 *             muda no lugar: o gatilho antigo é destruído e um novo criado.
 *             Evento disparado nessa janela NÃO é entregue — e some em
 *             silêncio. Rode com o produto parado.
 *
 * Uso:
 *   node scripts/deploy-por-regiao.js clientes  [--project dev]
 *   node scripts/deploy-por-regiao.js gatilhos  [--project dev]
 *   node scripts/deploy-por-regiao.js <fase> --lista   (só imprime os nomes)
 */
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(LIB, "index.js"))) {
  console.error("lib/ ausente — rode `npm run build` antes.");
  process.exit(1);
}

// A ordem importa: as opções globais precisam existir antes de qualquer
// endpoint ser definido, igual ao `index.ts`.
require(path.join(LIB, "global-options"));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js") && e.name !== "index.js") {
      out.push(p);
    }
  }
  return out;
}

/** Só o que o `index.ts` exporta é deployado — o resto é módulo interno. */
const exported = new Set(Object.keys(require(path.join(LIB, "index.js"))));

const clientes = new Set();
const gatilhos = new Set();
for (const file of walk(LIB)) {
  let mod;
  try {
    mod = require(file);
  } catch {
    continue;
  }
  for (const [name, value] of Object.entries(mod)) {
    const endpoint = value && value.__endpoint;
    if (!endpoint || !exported.has(name)) continue;
    const clientFacing = endpoint.callableTrigger || endpoint.httpsTrigger;
    (clientFacing ? clientes : gatilhos).add(name);
  }
}

const fase = process.argv[2];
const grupos = {clientes, gatilhos};
if (!grupos[fase]) {
  console.error("fase deve ser 'clientes' ou 'gatilhos'");
  process.exit(1);
}

const nomes = [...grupos[fase]].sort();
if (process.argv.includes("--lista")) {
  console.log(nomes.join("\n"));
  process.exit(0);
}

const only = nomes.map((n) => `functions:${n}`).join(",");
const extra = process.argv.slice(3);
console.error(`${fase}: ${nomes.length} funções`);
if (fase === "gatilhos") {
  console.error(
    "ATENÇÃO: muda a região destes gatilhos. O antigo é destruído antes de o " +
    "novo existir, e evento disparado na janela não é entregue.",
  );
}
execFileSync("npx", ["firebase", "deploy", "--only", only, ...extra], {stdio: "inherit"});
