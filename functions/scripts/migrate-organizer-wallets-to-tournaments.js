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
 * Idempotência: uma carteira com `migratedToTournamentWalletsAt` já foi
 * migrada — o script pula ela inteira (nem lê o extrato de novo). Sem essa
 * guarda, rodar duas vezes leria o resto (órfão + resíduo) que a primeira
 * rodada preservou de propósito como se fosse saldo novo, refaria o mesmo
 * rateio e creditaria os caixas outra vez.
 *
 * Atomicidade: todas as escritas de UMA carteira (caixa de cada torneio,
 * cópia das linhas do extrato, chave PIX, débito da carteira antiga) vão num
 * único `batch()`, comitado de uma vez só — um crash no meio não deixa
 * metade migrada. Se a carteira tiver mais operações do que o limite do
 * batch do Firestore (500), ela é pulada por completo (avisado na saída) em
 * vez de dividir o batch — dividir quebraria a própria atomicidade que ele
 * garante.
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
const MAX_OPS_POR_BATCH = 500;

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
  let carteirasJaMigradas = 0;

  for (const walletDoc of wallets.docs) {
    const uid = walletDoc.id;
    const w = walletDoc.data();

    // Idempotência: carteira já migrada numa rodada anterior — pula inteira,
    // sem nem ler o extrato de novo. Vale no dry-run também, para o
    // relatório mostrar o que seria pulado.
    const migradaEm = w.migratedToTournamentWalletsAt;
    if (migradaEm) {
      const quando = typeof migradaEm.toDate === "function" ?
        migradaEm.toDate().toISOString() :
        String(migradaEm);
      console.log(`\ncarteira ${uid}: já migrada em ${quando} — pulando`);
      carteirasJaMigradas++;
      continue;
    }

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

    // Reserva proporcional do órfão sobre o saldo VIVO — essa fração não
    // entra na distribuição entre torneios; é o que a carteira antiga
    // preserva (ver reconciliação abaixo).
    const orfaoReservado = creditadoTotal > 0 ?
      Math.round((available * (semTorneio / creditadoTotal)) * 100) / 100 :
      0;
    // O que sobra depois de reservar o órfão é o que pode, de fato, ser
    // distribuído entre os torneios atribuíveis.
    const distribuivel = Math.max(0, Math.round((available - orfaoReservado) * 100) / 100);

    // Rateia o saldo distribuível na proporção do que cada torneio creditou:
    // o extrato não registra de qual evento saiu cada saque, então proporção
    // é o mais defensável — e o relatório mostra a conta para conferência.
    //
    // O ÚLTIMO torneio leva o resto exato (distribuível − já rateado aos
    // anteriores), não a própria fatia arredondada: fatias independentes,
    // cada uma arredondada pra cima ou pra baixo, podem somar mais do que
    // existe (ex.: R$ 0,01 dividido 50/50 entre dois torneios viraria
    // R$0,01+R$0,01=R$0,02). Dar o resto ao último fecha a soma por
    // construção.
    let distribuidoCarteira = 0;
    const torneiosArr = [...porTorneio.entries()];
    for (let i = 0; i < torneiosArr.length; i++) {
      const [tournamentId, acc] = torneiosArr[i];
      const isUltimo = i === torneiosArr.length - 1;
      const fatia = isUltimo ?
        Math.max(0, Math.round((distribuivel - distribuidoCarteira) * 100) / 100) :
        (creditadoTotal > 0 ? Math.round((available * (acc.net / creditadoTotal)) * 100) / 100 : 0);
      const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
      const nome = (tSnap.data()?.name || "(torneio apagado)").trim();
      const ownerId = (tSnap.data()?.managerId || uid).trim();
      acc.fatia = fatia;
      acc.ownerId = ownerId;
      console.log(`  → ${tournamentId} "${nome}": creditou ${BRL(acc.net)}, leva ${BRL(fatia)}`);
      totalMovido += fatia;
      distribuidoCarteira += fatia;
    }

    // Cinto de segurança: se por qualquer motivo o distribuído passar do
    // disponível, avisa explicitamente em vez de deixar o leitor comparar
    // duas linhas de cabeça.
    if (distribuidoCarteira > available + 0.005) {
      console.log(
        `  ALERTA: distribuído (${BRL(distribuidoCarteira)}) passou do disponível ` +
        `(${BRL(available)}) — parar e investigar antes de aplicar!`,
      );
    }

    if (semTorneio > 0) {
      totalOrfao += semTorneio;
      console.log(`  ÓRFÃO: ${BRL(semTorneio)} sem inscrição resolvível — fica na carteira antiga`);
    }

    // Reconciliação da carteira: só debitamos o que foi de fato distribuído
    // (a mesma soma das fatias acima). O que sobra fica na carteira antiga
    // por construção — é o órfão reservado (mais eventual resíduo de
    // arredondamento) — e é exatamente isso que o cabeçalho promete não
    // apagar. Nunca abaixo de zero.
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
    if (pixKey) console.log(`  chave PIX → organizerPayoutProfiles/${uid}`);

    // Atomicidade: conta as operações ANTES de decidir. Se passar do limite
    // do batch, pula a carteira inteira em vez de dividir em vários commits
    // — dividir quebraria a atomicidade que estamos tentando garantir.
    const numOperacoes = torneiosArr.reduce((s, [, acc]) => s + 1 + acc.entries.length, 0) +
      (pixKey ? 1 : 0) + (vaiGravarNaCarteiraAntiga ? 1 : 0);
    const excedeLimiteBatch = numOperacoes > MAX_OPS_POR_BATCH;
    if (excedeLimiteBatch) {
      console.log(
        `  ALERTA: ${numOperacoes} operações nesta carteira passam do limite do batch ` +
        `(${MAX_OPS_POR_BATCH}) — ` +
        (APPLY ?
          "PULANDO a aplicação desta carteira." :
          "na aplicação, esta carteira seria pulada."),
      );
    }

    if (APPLY && !excedeLimiteBatch && numOperacoes > 0) {
      const batch = db.batch();
      for (const [tournamentId, acc] of torneiosArr) {
        batch.set(db.doc(`tournamentWallets/${tournamentId}`), {
          tournamentId,
          ownerId: acc.ownerId,
          availableReais: admin.firestore.FieldValue.increment(acc.fatia),
          pendingReais: 0,
          migratedFromOrganizerWallet: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});

        for (const {id, data} of acc.entries) {
          batch.set(db.doc(`tournamentWallets/${tournamentId}/ledger/${id}`), {
            ...data, migratedFrom: `organizerWallets/${uid}/ledger/${id}`,
          }, {merge: true});
        }
      }

      if (pixKey) {
        batch.set(db.doc(`organizerPayoutProfiles/${uid}`), {
          payoutPixKey: pixKey,
          payoutPixKeyType: (w.payoutPixKeyType || "").trim(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }

      if (vaiGravarNaCarteiraAntiga) {
        // Debita só o que foi distribuído — NUNCA zera incondicionalmente.
        // `restanteCarteira` pode ficar > 0 de propósito: é o órfão (ou
        // resíduo de arredondamento) que a carteira antiga preserva para
        // decisão manual, não dinheiro perdido no processo. É a presença
        // deste `migratedToTournamentWalletsAt` que a guarda de
        // idempotência checa na próxima rodada.
        batch.set(walletDoc.ref, {
          availableReais: restanteCarteira,
          migratedToTournamentWalletsAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }

      await batch.commit();
    }
    // Se não há nenhuma operação (carteira 100% órfã, vazia, ou passou do
    // limite do batch), não escrevemos nada aqui — nem o timestamp — para a
    // carteira não parecer migrada quando na verdade nada foi movido dela.
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

  console.log(
    `\nRESUMO: movido ${BRL(totalMovido)} | órfão ${BRL(totalOrfao)} | ` +
    `staff corrigido ${semRole.length} | carteiras já migradas (puladas) ${carteirasJaMigradas}`,
  );
  if (!APPLY) console.log("DRY-RUN — nada foi gravado. Rode de novo com --yes para aplicar.\n");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
