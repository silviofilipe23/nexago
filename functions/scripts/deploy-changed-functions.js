#!/usr/bin/env node
/**
 * Deploy só das functions afetadas por um diff.
 *
 * `firebase deploy --only functions` sobe as ~200 funções do projeto e leva
 * dezenas de minutos. Este script descobre quais mudaram DE FATO — seguindo a
 * cadeia de imports, não só o arquivo tocado — e monta o `--only` com elas.
 *
 *   node scripts/deploy-changed-functions.js --project dev
 *   node scripts/deploy-changed-functions.js --project dev --base origin/main
 *   node scripts/deploy-changed-functions.js --project dev --dry-run
 *
 * SOBRE REGIÃO: o script NUNCA passa região no comando, e isso é deliberado.
 * A região de cada função mora no código (`function-regions.ts`):
 * `southamerica-east1` é a casa, e as callables ainda respondem TAMBÉM em
 * `us-central1` enquanto a migração não termina. Um deploy restrito a São Paulo
 * APAGARIA o endpoint de Iowa — e nesse instante o app publicado na loja passa
 * a receber NOT FOUND em toda callable, e os webhooks de Asaas, Mercado Pago e
 * emissor fiscal param de chegar. Quem tira Iowa é o rollout descrito em
 * `function-regions.ts`, editando `CLIENT_FACING_REGIONS` — não uma flag aqui.
 */

const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const SRC = path.join(__dirname, "..", "src");
const INDEX = path.join(SRC, "index.ts");

/** `.firebaserc`: `default` é PRODUÇÃO. Exigir o projeto é o que impede o
 *  deploy de dev cair em prod por omissão. */
const PROJECTS = {
  dev: "volley-track-dev-4596c",
  prod: "volley-track-2dd3b",
};

/** Regiões que o código pode declarar. Qualquer outra é erro de digitação. */
const ALLOWED_REGIONS = ["southamerica-east1", "us-central1"];

// ─── Argumentos ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {base: "origin/main", dryRun: false, yes: false, project: ""};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--yes" || arg === "-y") out.yes = true;
    else if (arg === "--base") out.base = argv[++i] ?? "";
    else if (arg === "--project") out.project = argv[++i] ?? "";
    else if (arg.startsWith("--base=")) out.base = arg.slice(7);
    else if (arg.startsWith("--project=")) out.project = arg.slice(10);
    else {
      console.error(`Argumento desconhecido: ${arg}`);
      process.exit(2);
    }
  }
  return out;
}

function resolveProject(value) {
  const raw = value.trim();
  if (!raw) {
    console.error(
      "--project é obrigatório.\n" +
      "  O `default` do .firebaserc é PRODUÇÃO: sem a flag, um deploy de dev vai pro lugar errado.\n" +
      "  Use: --project dev   (ou --project prod, ou o id completo)",
    );
    process.exit(2);
  }
  return PROJECTS[raw] ?? raw;
}

// ─── Git ────────────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync("git", args, {cwd: SRC, encoding: "utf8"});
}

/**
 * Arquivos de `src/` mudados: o diff contra a base MAIS o que não foi
 * commitado. Sem a segunda parte, rodar o script com trabalho na árvore
 * deployaria a versão antiga sem avisar.
 */
function changedSourceFiles(base) {
  const files = new Set();
  const add = (out) => {
    for (const line of out.split("\n")) {
      const file = line.trim();
      if (file) files.add(path.basename(file));
    }
  };

  try {
    add(git(["diff", "--name-only", `${base}...HEAD`, "--", "."]));
  } catch {
    console.error(`Não consegui comparar com "${base}". Existe? (git fetch origin)`);
    process.exit(2);
  }
  add(git(["diff", "--name-only", "--", "."]));           // não indexado
  add(git(["diff", "--name-only", "--cached", "--", "."])); // indexado
  add(git(["ls-files", "--others", "--exclude-standard", "--", "."])); // novos

  return [...files].filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

// ─── Grafo de imports ───────────────────────────────────────────────────────

const importsCache = new Map();

/** Imports relativos diretos de um módulo de `src/`, por nome de arquivo. */
function directImports(file) {
  if (importsCache.has(file)) return importsCache.get(file);
  const full = path.join(SRC, file);
  let source = "";
  try {
    source = fs.readFileSync(full, "utf8");
  } catch {
    importsCache.set(file, []);
    return [];
  }
  const out = new Set();
  const re = /from\s+"\.\/([^"]+)"|import\s+"\.\/([^"]+)"/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = (m[1] ?? m[2]).replace(/\.js$/, "");
    for (const candidate of [`${name}.ts`, path.join(name, "index.ts")]) {
      if (fs.existsSync(path.join(SRC, candidate))) out.add(candidate);
    }
  }
  const list = [...out];
  importsCache.set(file, list);
  return list;
}

/** Fecho transitivo dos imports — é o que faz uma mudança em `match-status.ts`
 *  marcar todas as funções que dependem dela, e não só o arquivo tocado. */
const depsCache = new Map();
function transitiveDeps(file, seen = new Set()) {
  if (depsCache.has(file)) return depsCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const out = new Set([file]);
  for (const dep of directImports(file)) {
    for (const sub of transitiveDeps(dep, seen)) out.add(sub);
  }
  if (seen.size === 1) depsCache.set(file, out);
  return out;
}

// ─── Exports do index.ts ────────────────────────────────────────────────────

/**
 * Nome exportado → arquivo que o define.
 *
 * `index.ts` usa os dois formatos: `export {a} from "./mod"` e um bloco
 * `export {a, b}` no fim, cujos nomes vieram dos imports do topo. Ler só um
 * deles deixaria metade das funções de fora do deploy, em silêncio.
 */
function exportedFunctions() {
  const source = fs.readFileSync(INDEX, "utf8");
  const bare = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const byName = new Map();

  // import {a, b} from "./mod"
  const importRe = /import\s*\{([^}]+)\}\s*from\s*"\.\/([^"]+)"/g;
  const importedFrom = new Map();
  let m;
  while ((m = importRe.exec(bare)) !== null) {
    const file = `${m[2].replace(/\.js$/, "")}.ts`;
    for (const name of splitNames(m[1])) importedFrom.set(name, file);
  }

  // export {a, b} from "./mod"
  const reexportRe = /export\s*\{([^}]+)\}\s*from\s*"\.\/([^"]+)"/g;
  while ((m = reexportRe.exec(bare)) !== null) {
    const file = `${m[2].replace(/\.js$/, "")}.ts`;
    for (const name of splitNames(m[1])) byName.set(name, file);
  }

  // export {a, b}  — sem `from`: resolve pelos imports do topo
  const plainRe = /export\s*\{([^}]+)\}\s*(?!from)[;\n]/g;
  while ((m = plainRe.exec(bare)) !== null) {
    for (const name of splitNames(m[1])) {
      const file = importedFrom.get(name);
      if (file) byName.set(name, file);
    }
  }
  return byName;
}

function splitNames(block) {
  return block
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const as = part.split(/\s+as\s+/);
      return (as[1] ?? as[0]).trim();
    })
    .filter((name) => name && name !== "default");
}

// ─── Região ─────────────────────────────────────────────────────────────────

/** Região literal fora da lista é quase sempre engano de digitação — e um
 *  engano que cria um endpoint novo em vez de falhar. */
function suspiciousRegions(files) {
  const found = [];
  for (const file of files) {
    let source = "";
    try {
      source = fs.readFileSync(path.join(SRC, file), "utf8");
    } catch {
      continue;
    }
    const re = /region:\s*\[?\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      if (!ALLOWED_REGIONS.includes(m[1])) found.push({file, region: m[1]});
    }
  }
  return found;
}

// ─── Execução ───────────────────────────────────────────────────────────────

async function confirm(question) {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim().toLowerCase() === "s";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProject(args.project);

  const changed = changedSourceFiles(args.base);
  if (changed.length === 0) {
    console.log(`Nenhum .ts de src/ mudou em relação a ${args.base}. Nada a fazer.`);
    return;
  }

  console.log(`Base: ${args.base}`);
  console.log(`Arquivos alterados (${changed.length}):`);
  for (const file of changed) console.log(`  ${file}`);

  const changedSet = new Set(changed);
  const exports = exportedFunctions();
  const selected = [];
  for (const [name, file] of exports) {
    const deps = transitiveDeps(file);
    if ([...deps].some((dep) => changedSet.has(dep))) selected.push(name);
  }
  selected.sort();

  console.log(`\nFunctions afetadas: ${selected.length} de ${exports.size}`);
  for (const name of selected) console.log(`  ${name}`);

  if (selected.length === 0) {
    console.log("\nNenhuma function depende do que mudou (docs, testes ou script?).");
    return;
  }

  const suspeitas = suspiciousRegions(changed);
  if (suspeitas.length > 0) {
    console.log("\nATENÇÃO — região fora do esperado:");
    for (const s of suspeitas) console.log(`  ${s.file}: "${s.region}"`);
    console.log(`  Esperado: ${ALLOWED_REGIONS.join(", ")} (ver function-regions.ts)`);
  }

  if (selected.length > 40) {
    console.log(
      `\nSão ${selected.length} functions — algo bem no fundo da cadeia mudou.\n` +
      "  Um deploy inteiro (`firebase deploy --only functions`) costuma ser mais previsível.",
    );
  }

  const only = selected.map((name) => `functions:${name}`).join(",");
  const cmd = ["deploy", "--only", only, "--project", projectId];

  console.log("\nComando:");
  console.log(`  firebase ${cmd.join(" ")}`);
  console.log(
    "\nRegiões: vêm do código, não deste comando. As callables sobem em " +
    `${ALLOWED_REGIONS.join(" e ")} enquanto a migração não termina — ver function-regions.ts.`,
  );
  console.log(
    "Function APAGADA não sai daqui: `--only` só cria e atualiza. " +
    "Remoção é `firebase functions:delete <nome> --project <id>`.",
  );

  if (args.dryRun) {
    console.log("\n--dry-run: nada foi executado.");
    return;
  }

  if (!args.yes) {
    const ok = await confirm(`\nDeploy em ${projectId}? [s/N] `);
    if (!ok) {
      console.log("Cancelado.");
      return;
    }
  }

  console.log("\n> npm run build");
  execFileSync("npm", ["run", "build"], {cwd: path.join(SRC, ".."), stdio: "inherit"});

  console.log(`\n> firebase ${cmd.join(" ")}`);
  execFileSync("firebase", cmd, {cwd: path.join(SRC, ".."), stdio: "inherit"});

  console.log(
    "\nConfira a lista de funções no fim da saída do deploy. " +
    "Depois de uma falha parcial, `No changes detected` numa nova tentativa NÃO garante que tudo subiu.",
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
