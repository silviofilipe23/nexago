/* eslint-disable */
/**
 * Move o saldo de `organizerWallets/{uid}` para `tournamentWallets/{tournamentId}`.
 *
 * O extrato de cada carteira tem `registrationId`, e a inscrição sabe o torneio —
 * é por aí que se reconstrói a que evento cada real pertence. Crédito que não
 * puder ser atribuído NÃO é movido nem apagado: sai no relatório para decisão
 * manual.
 *
 * Também: copia a chave PIX de repasse para `organizerPayoutProfiles/{uid}` e
 * preenche `role: 'manager'` nos docs de staff sem o campo (as rules exigem o
 * papel explícito; o backend trata ausente como gestor, e essa divergência
 * deixaria alguém sacando sem conseguir ver).
 *
 * ATENÇÃO — DEV é base viva: o app publicado na loja aponta para este mesmo
 * projeto, então o saldo muda com o tráfego real entre uma rodada e outra.
 * Um dry-run de horas atrás não autoriza o apply: rode o dry-run de novo
 * IMEDIATAMENTE antes do `--yes` e confira o resumo na hora — é esse número,
 * não o de uma rodada anterior, que vale para decidir aplicar.
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c
 *   node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c --yes
 */
const admin = require("firebase-admin");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ?
    process.argv[i + 1] :
    fallback;
}
const APPLY = process.argv.includes("--yes");
const PROJECT = arg("project");
if (!PROJECT) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const BRL = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

async function tournamentOfRegistration(registrationId, cache) {
  if (!registrationId) return "";
  if (cache.has(registrationId)) return cache.get(registrationId);
  const snap = await db
    .doc(`artifacts/${PROJECT}/public/data/inscriptions/${registrationId}`)
    .get();
  const tournamentId = (snap.data()?.tournamentId || "").trim();
  cache.set(registrationId, tournamentId);
  return tournamentId;
}

async function main() {
  console.log(`\nProjeto: ${PROJECT}  |  modo: ${APPLY ? "APLICAR" : "DRY-RUN"}\n`);
  const wallets = await db.collection("organizerWallets").get();
  const cache = new Map();
  let totalMovido = 0;
  let totalOrfao = 0;

  for (const walletDoc of wallets.docs) {
    const uid = walletDoc.id;
    const w = walletDoc.data();
    const available = Number(w.availableReais) || 0;
    const pending = Number(w.pendingReais) || 0;
    console.log(`\ncarteira ${uid}: disp=${BRL(available)} pend=${BRL(pending)}`);

    if (pending > 0) {
      console.log("  ATENÇÃO: saque pendente nesta carteira — resolver antes de migrar");
    }

    const ledger = await walletDoc.ref.collection("ledger").get();
    const porTorneio = new Map();
    let semTorneio = 0;
    for (const entry of ledger.docs) {
      const e = entry.data();
      const net = Number(e.netReais) || 0;
      const tournamentId = await tournamentOfRegistration(e.registrationId, cache);
      if (!tournamentId) {
        semTorneio += net;
        continue;
      }
      const acc = porTorneio.get(tournamentId) || {net: 0, entries: []};
      acc.net += net;
      acc.entries.push({id: entry.id, data: e});
      porTorneio.set(tournamentId, acc);
    }

    const creditadoTotal = [...porTorneio.values()].reduce((s, a) => s + a.net, 0) + semTorneio;
    const jaSacado = Math.max(0, creditadoTotal - available - pending);
    console.log(`  extrato: ${ledger.size} linhas | creditado=${BRL(creditadoTotal)} | já sacado=${BRL(jaSacado)}`);

    // Rateia o saldo vivo na proporção do que cada torneio creditou: o extrato
    // não registra de qual evento saiu cada saque, então proporção é o mais
    // defensável — e o relatório mostra a conta para conferência.
    let distribuidoCarteira = 0;
    for (const [tournamentId, acc] of porTorneio) {
      const fatia = creditadoTotal > 0 ?
        Math.round((available * (acc.net / creditadoTotal)) * 100) / 100 :
        0;
      const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
      const nome = (tSnap.data()?.name || "(torneio apagado)").trim();
      const ownerId = (tSnap.data()?.managerId || uid).trim();
      console.log(`  → ${tournamentId} "${nome}": creditou ${BRL(acc.net)}, leva ${BRL(fatia)}`);
      totalMovido += fatia;
      distribuidoCarteira += fatia;
      if (!APPLY) continue;

      await db.doc(`tournamentWallets/${tournamentId}`).set({
        tournamentId,
        ownerId,
        availableReais: admin.firestore.FieldValue.increment(fatia),
        pendingReais: 0,
        migratedFromOrganizerWallet: uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      for (const {id, data} of acc.entries) {
        await db.doc(`tournamentWallets/${tournamentId}/ledger/${id}`).set({
          ...data, migratedFrom: `organizerWallets/${uid}/ledger/${id}`,
        }, {merge: true});
      }
    }

    if (semTorneio > 0) {
      totalOrfao += semTorneio;
      console.log(`  ÓRFÃO: ${BRL(semTorneio)} sem inscrição resolvível — fica na carteira antiga`);
    }

    // Reconciliação da carteira: só debitamos o que foi de fato distribuído
    // (a mesma soma das fatias acima). O que sobra fica na carteira antiga
    // por construção — é a parte que não pôde ser atribuída (mais eventual
    // resíduo de arredondamento das fatias) — e é exatamente isso que o
    // cabeçalho promete não apagar. Nunca abaixo de zero.
    const restanteCarteira = distribuidoCarteira > 0 ?
      Math.max(0, Math.round((available - distribuidoCarteira) * 100) / 100) :
      available;
    const vaiGravarNaCarteiraAntiga = distribuidoCarteira > 0;
    console.log(
      `  carteira: distribuído=${BRL(distribuidoCarteira)} | resto órfão=${BRL(restanteCarteira)} | ` +
      (vaiGravarNaCarteiraAntiga ?
        `ficará gravado availableReais=${BRL(restanteCarteira)}` :
        "nada será gravado aqui — carteira fica intocada (nenhuma fatia distribuível)"),
    );

    const pixKey = (w.payoutPixKey || "").trim();
    if (pixKey) {
      console.log(`  chave PIX → organizerPayoutProfiles/${uid}`);
      if (APPLY) {
        await db.doc(`organizerPayoutProfiles/${uid}`).set({
          payoutPixKey: pixKey,
          payoutPixKeyType: (w.payoutPixKeyType || "").trim(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }
    }

    if (APPLY && vaiGravarNaCarteiraAntiga) {
      // Debita só o que foi distribuído — NUNCA zera incondicionalmente.
      // `restanteCarteira` pode ficar > 0 de propósito: é a parte órfã (ou
      // resíduo de arredondamento) que a carteira antiga preserva para
      // decisão manual, não dinheiro perdido no processo.
      await walletDoc.ref.set({
        availableReais: restanteCarteira,
        migratedToTournamentWalletsAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    // Se nada foi distribuído (carteira 100% órfã ou sem saldo), não
    // escrevemos nada aqui — nem o timestamp — para a carteira não parecer
    // migrada quando na verdade não teve nenhuma fatia movida.
  }

  // Backfill do papel: as rules exigem `role` explícito.
  //
  // O filtro de caminho NÃO é decorativo: `arenas/{arenaId}/staff/{uid}` usa a
  // mesma subcoleção, com outro conjunto de cargos (RBAC da arena). Sem ele,
  // este backfill gravaria `role: 'manager'` na equipe das arenas.
  const staff = await db.collectionGroup("staff").get();
  const semRole = staff.docs.filter(
    (d) => !d.data().role && d.ref.path.startsWith("tournaments/"),
  );
  console.log(`\nstaff sem campo role: ${semRole.length}`);
  for (const d of semRole) {
    console.log(`  → ${d.ref.path} = manager`);
    if (APPLY) await d.ref.set({role: "manager"}, {merge: true});
  }

  console.log(`\nRESUMO: movido ${BRL(totalMovido)} | órfão ${BRL(totalOrfao)} | staff corrigido ${semRole.length}`);
  if (!APPLY) console.log("DRY-RUN — nada foi gravado. Rode de novo com --yes para aplicar.\n");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
