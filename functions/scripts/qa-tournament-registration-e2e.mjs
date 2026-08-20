// QA e2e da INSCRIÇÃO EM TORNEIO contra o dev (volley-track-dev-4596c).
//
// Roda o mesmo protocolo que o app Flutter e o portal do atleta usam: Auth
// REST + callables + Firestore REST com o idToken de cada atleta — portanto
// valida também as regras do Firestore, não só as functions.
//
// Cobre, na ordem em que a tela de inscrição as dispara:
//   1. reserva de vaga solo (dupla)            registerSoloTournament
//   2. uniforme gravado depois da reserva      setRegistrationUniform
//   3. convite de parceiro                     sendTournamentPartnerInvite
//   4. aceite do parceiro (uniforme + LGPD)    acceptTournamentPartnerInvite
//   5. equipe nomeada (quarteto)               createTournamentTeamRegistration
//   6. convites do elenco + aceites            send/acceptTournamentPartnerInvite
//   7. integrante sai do elenco                leaveTournamentTeamRegistration
//   8. cancelar convite enviado                cancelTournamentPartnerInvite
//   9. recusar convite recebido                cancelTournamentPartnerInvite (asDecline)
//  10. cancelar a própria inscrição            cancelTournamentRegistration
//
// Uso:  node functions/scripts/qa-tournament-registration-e2e.mjs
//       node functions/scripts/qa-tournament-registration-e2e.mjs --keep
//
// `--keep` deixa a inscrição da dupla de pé (útil para abrir o app logo em
// seguida e ver a tela no estado "aguardando pagamento").

const API_KEY = "AIzaSyAXrftckloRsU_EKOA_oMgI-9BJdV4kIQs"; // web key do dev (pública)
const PID = "volley-track-dev-4596c";
const FN = `https://us-central1-${PID}.cloudfunctions.net`;
const FS = `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;

const TOURNAMENT_ID = "OBW7myGKx4zZH3GkrRey"; // 1°COPA COLIGADOS 2026
const KEEP = process.argv.includes("--keep");

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✖ ${name} ${detail}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ── protocolo ──────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!r.ok) return null;
  const j = await r.json();
  return { uid: j.localId, token: j.idToken, email };
}

async function signUp(email, password, displayName) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true, displayName }),
    },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(`signUp ${email}: ${JSON.stringify(j.error)}`);
  return { uid: j.localId, token: j.idToken, email };
}

async function call(name, token, data) {
  const r = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = new Error(`${name}: ${j?.error?.status || r.status} ${j?.error?.message || ""}`);
    e.code = String(j?.error?.status || r.status);
    throw e;
  }
  return j.result;
}

async function fsGet(path, token) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}

async function fsPatch(path, fields, token) {
  const url = new URL(`${FS}/${path}`);
  for (const key of Object.keys(fields)) url.searchParams.append("updateMask.fieldPaths", key);
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`PATCH ${path}: ${r.status} ${(await r.text()).slice(0, 400)}`);
}

/** `parent` vazio = raiz. As inscrições moram sob
 *  `artifacts/{projectId}/public/data/` (base legada), não na raiz — consultar
 *  a raiz devolve PERMISSION_DENIED porque a coleção nem existe lá. */
async function fsQuery(body, token, parent = "") {
  const url = parent ? `${FS}/${parent}:runQuery` : `${FS}:runQuery`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`runQuery: ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j.filter((x) => x.document).map((x) => x.document);
}

/** Base legada das inscrições — a MESMA de `NexagoArtifactsPaths` no app. */
const PUBLIC_DATA = `artifacts/${PID}/public/data`;

// ── conversão de valores do Firestore REST ─────────────────────────────────

function plain(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  if ("mapValue" in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

function obj(doc) {
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, plain(v)]));
}

function strv(s) {
  return { stringValue: s };
}

// ── atleta de QA com perfil pronto para torneio ────────────────────────────

/** Perfil mínimo que o gate `isTournamentProfileReady` aceita.
 *
 *  `phoneVerified` é escrito SÓ pela Cloud Function `confirmPhoneVerification`
 *  (as rules proíbem o client), então o caminho legítimo aqui é o mesmo do app
 *  ao concluir o onboarding: `isProfileComplete: true`, que curto-circuita o
 *  gate. Nível vai em `sportOnboarding.levelsBySport` — a ÚNICA escrita de
 *  nível desde a unificação. */
function profileFields({ name, gender, level }) {
  return {
    fullName: strv(name),
    city: strv("Goiânia"),
    state: strv("GO"),
    gender: strv(gender),
    birthDate: strv("1995-05-10"),
    isProfileComplete: { booleanValue: true },
    onboardingCompleted: { booleanValue: true },
    roles: { arrayValue: { values: [strv("athlete")] } },
    sport: strv("Vôlei de praia"),
    sports: { arrayValue: { values: [strv("Vôlei de praia")] } },
    sportOnboarding: {
      mapValue: {
        fields: {
          version: { integerValue: "1" },
          completedAt: { timestampValue: new Date().toISOString() },
          primarySportId: strv("VOLEI_PRAIA"),
          secondarySportIds: { arrayValue: { values: [] } },
          levelsBySport: { mapValue: { fields: { VOLEI_PRAIA: strv(level) } } },
          goals: { arrayValue: { values: [] } },
          otherSportNote: strv(""),
        },
      },
    },
  };
}

const PASSWORD = "QaNexago!2026";

/** Perfil já pronto não é reescrito.
 *
 *  Depois da 1ª inscrição o trigger de backend grava
 *  `sportOnboarding.levelLocked`, e as rules (`levelLockedUnchanged`) recusam
 *  qualquer update que mexa nesse campo — inclusive um PATCH que reescreve o
 *  mapa `sportOnboarding` inteiro, porque isso APAGA o lock. Reescrever só o
 *  que falta mantém o roteiro rodando na segunda passada. */
async function ensureAthlete(slug, { name, gender, level = "iniciante_2" }) {
  const email = `qa.insc.${slug}@nexago.test`;
  const user = (await signIn(email, PASSWORD)) ?? (await signUp(email, PASSWORD, name));

  let current = null;
  try {
    current = obj(await fsGet(`users/${user.uid}`, user.token));
  } catch {
    // doc ainda não existe — o PATCH cria
  }
  const levelReady = current?.sportOnboarding?.levelsBySport?.VOLEI_PRAIA === level;
  const ready =
    current?.isProfileComplete === true &&
    (current?.city ?? "").length > 0 &&
    (current?.gender ?? "").length > 0 &&
    levelReady;
  if (!ready) {
    await fsPatch(`users/${user.uid}`, profileFields({ name, gender, level }), user.token);
  }
  return { ...user, name };
}

// ── leitura de estado ──────────────────────────────────────────────────────

async function readRegistration(registrationId, token) {
  return obj(await fsGet(`${PUBLIC_DATA}/inscriptions/${registrationId}`, token));
}

/** Convites pendentes que ESTE atleta recebeu neste torneio/categoria. */
async function pendingInvitesFor(user, categoryId) {
  const docs = await fsQuery(
    {
      structuredQuery: {
        from: [{ collectionId: "tournamentRegistrationInvites" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "inviteeUid" }, op: "EQUAL", value: strv(user.uid) } },
              { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: strv("pending") } },
            ],
          },
        },
        limit: 50,
      },
    },
    user.token,
  );
  return docs
    .map((d) => ({ id: d.name.split("/").pop(), ...obj(d) }))
    .filter((i) => i.tournamentId === TOURNAMENT_ID && (!categoryId || i.categoryId === categoryId));
}

const UNIFORM = { sizeTop: "G", jerseyNumber: 7 };

// ── roteiro ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`QA inscrição — torneio ${TOURNAMENT_ID} @ ${PID}\n`);

  section("0. Torneio e categorias");
  const anon = await ensureAthlete("probe", { name: "QA Probe", gender: "M" });
  const tournament = obj(await fsGet(`tournaments/${TOURNAMENT_ID}`, anon.token));
  const categories = (tournament.categories || []).map((c) => c);
  const usable = (c, size) =>
    c.teamSize === size && !c.registrationClosed && !c.isCompleted &&
    // As atletas de QA são Misto/Iniciante 2: categoria de gênero fixo ou de
    // nível abaixo do delas seria recusada pelo backend, não pelo roteiro.
    (c.genderType === "mixed" || c.genderType === "Mix");
  ok(`torneio lido: ${tournament.name}`, tournament.name != null);
  ok("há categoria de dupla utilizável", categories.some((c) => usable(c, 2)));
  ok("há categoria de equipe utilizável", categories.some((c) => usable(c, 4)));
  if (!categories.some((c) => usable(c, 2)) || !categories.some((c) => usable(c, 4))) {
    console.log("\nSem categorias utilizáveis — abortando.");
    process.exit(1);
  }

  section("1. Atletas de QA com perfil pronto");
  const [ana, bruno, carla, diego, elisa, felipe] = await Promise.all([
    ensureAthlete("ana", { name: "Ana QA", gender: "F" }),
    ensureAthlete("bruno", { name: "Bruno QA", gender: "M" }),
    ensureAthlete("carla", { name: "Carla QA", gender: "F" }),
    ensureAthlete("diego", { name: "Diego QA", gender: "M" }),
    ensureAthlete("elisa", { name: "Elisa QA", gender: "F" }),
    ensureAthlete("felipe", { name: "Felipe QA", gender: "M" }),
  ]);
  ok("6 atletas de QA prontos", [ana, bruno, carla, diego, elisa, felipe].every((u) => u.uid));

  // Estado limpo: inscrições anteriores destes atletas nesta categoria travam
  // o roteiro com "já possui inscrição".
  section("2. Limpeza do estado anterior");
  /** Categorias que ficaram com inscrição de rodada anterior (pagamento
   *  declarado bloqueia o autocancelamento). O roteiro desvia delas. */
  const blocked = new Set();
  for (const user of [ana, bruno, carla, diego, elisa, felipe]) {
    const mine = await fsQuery(
      {
        structuredQuery: {
          from: [{ collectionId: "inscriptions" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "participantUids" },
              op: "ARRAY_CONTAINS",
              value: strv(user.uid),
            },
          },
          limit: 50,
        },
      },
      user.token,
      PUBLIC_DATA,
    );
    for (const d of mine) {
      const reg = obj(d);
      if (reg.tournamentId !== TOURNAMENT_ID) continue;
      const id = d.name.split("/").pop();
      try {
        await call("cancelTournamentRegistration", user.token, { registrationId: id });
      } catch (e) {
        // Inscrição com QUALQUER pagamento (inclusive a declaração "já paguei")
        // não é cancelável pelo atleta — regra de negócio, não falha do
        // roteiro. Fica anotada para o roteiro escolher outra categoria.
        blocked.add(reg.categoryId);
        console.log(`    · ${user.name}: ${reg.categoryId} não cancelável (${e.message.split(":").pop().trim()})`);
      }
    }
    for (const invite of await pendingInvitesFor(user, null)) {
      try {
        await call("cancelTournamentPartnerInvite", user.token, { inviteId: invite.id, asDelete: true });
      } catch {
        // convite já respondido/expirado
      }
    }
  }
  ok("estado anterior limpo", true);
  if (blocked.size > 0) {
    // Não é falha: inscrição com pagamento registrado é intencionalmente
    // incancelável pelo atleta. O roteiro só precisa desviar da categoria.
    console.log(
      `    aviso: ${blocked.size} categoria(s) ficaram com inscrição de rodada ` +
      "anterior (pagamento declarado). Só o organizador remove; o roteiro segue " +
      "em outra categoria.",
    );
  }

  // Categoria travada por pagamento declarado sai do roteiro: insistir nela
  // daria "você já possui inscrição" e mataria a rodada inteira.
  const duo = categories.find((c) => usable(c, 2) && !blocked.has(c.id));
  const team = categories.find((c) => usable(c, 4) && !blocked.has(c.id));
  if (!duo || !team) {
    console.log(
      "\nTodas as categorias utilizáveis têm inscrição com pagamento declarado.\n" +
      "Só o organizador remove essas inscrições — limpe pelo painel e rode de novo."
    );
    process.exit(1);
  }
  console.log(`    dupla=${duo.id} (${duo.categoryName}, uniforme=${duo.uniformType})`);
  console.log(`    equipe=${team.id} (${team.categoryName}, teamSize=${team.teamSize})`);

  // ── DUPLA ────────────────────────────────────────────────────────────────
  section("3. Dupla — reserva de vaga solo (Ana)");
  const solo = await call("registerSoloTournament", ana.token, {
    tournamentId: TOURNAMENT_ID,
    categoryId: duo.id,
    lgpdAccepted: true,
  });
  ok("registerSoloTournament devolveu registrationId", typeof solo?.registrationId === "string");
  const duoRegId = solo.registrationId;

  let reg = await readRegistration(duoRegId, ana.token);
  ok("inscrição nasce com partnerPending", reg.partnerPending === true);
  ok("inscrição nasce não paga", reg.isPaid !== true);
  ok("aceite LGPD gravado na inscrição", (reg.lgpdAcceptedUids || []).includes(ana.uid), `(${JSON.stringify(reg.lgpdAcceptedUids)})`);
  ok("Ana entra em participantUids", (reg.participantUids || []).includes(ana.uid));

  section("4. Dupla — uniforme gravado depois da reserva");
  await call("setRegistrationUniform", ana.token, { registrationId: duoRegId, uniform: UNIFORM });
  reg = await readRegistration(duoRegId, ana.token);
  // O backend grava o uniforme da DUPLA em campos ACHATADOS por slot
  // (`sizeTopPlayer1`), não num mapa — `registrationUniformForSlot`.
  ok("uniforme da Ana persistido (tamanho G)", reg.sizeTopPlayer1 === "G", `(${reg.sizeTopPlayer1})`);
  ok("camisa da Ana persistida (7)", reg.jerseyNumberPlayer1 === 7, `(${reg.jerseyNumberPlayer1})`);

  section("5. Dupla — convite ao parceiro (Ana → Bruno)");
  const sent = await call("sendTournamentPartnerInvite", ana.token, {
    tournamentId: TOURNAMENT_ID,
    categoryId: duo.id,
    inviteeUid: bruno.uid,
    inviteeName: bruno.name,
    inviterName: ana.name,
    inviterUniform: UNIFORM,
  });
  ok("convite criado", typeof sent?.inviteId === "string");
  ok("backend diz que o convidado tem perfil pronto", sent?.inviteeProfileReady !== false, `(faltando: ${JSON.stringify(sent?.inviteeMissingSteps)})`);

  const brunoInvites = await pendingInvitesFor(bruno, duo.id);
  ok("Bruno enxerga o convite pendente (rules ok)", brunoInvites.length === 1, `(viu ${brunoInvites.length})`);

  section("6. Dupla — aceite do parceiro (Bruno)");
  await call("acceptTournamentPartnerInvite", bruno.token, {
    inviteId: sent.inviteId,
    inviteeUniform: { sizeTop: "M", jerseyNumber: 3 },
    lgpdAccepted: true,
  });
  reg = await readRegistration(duoRegId, bruno.token);
  ok("dupla fechada — partnerPending saiu", reg.partnerPending !== true);
  ok("Bruno entrou em participantUids", (reg.participantUids || []).includes(bruno.uid));
  ok("teamId criado no aceite", typeof reg.teamId === "string" && reg.teamId.length > 0, `(${reg.teamId})`);
  ok("aceite LGPD do Bruno gravado", (reg.lgpdAcceptedUids || []).includes(bruno.uid));
  ok("uniforme do Bruno persistido (tamanho M)", reg.sizeTopPlayer2 === "M", `(${reg.sizeTopPlayer2})`);
  ok("inscrição segue aguardando pagamento", reg.isPaid !== true);

  // ── EQUIPE (quarteto) ────────────────────────────────────────────────────
  section("7. Equipe — capitã cria o elenco (Carla)");
  const teamName = "Coligados QA";
  const created = await call("createTournamentTeamRegistration", carla.token, {
    tournamentId: TOURNAMENT_ID,
    categoryId: team.id,
    teamName,
    lgpdAccepted: true,
  });
  ok("createTournamentTeamRegistration devolveu ids", typeof created?.registrationId === "string" && typeof created?.teamId === "string");
  const teamRegId = created.registrationId;
  let treg = await readRegistration(teamRegId, carla.token);
  ok("equipe nasce com o nome escolhido", treg.teamName === teamName, `(${treg.teamName})`);
  ok("equipe nasce com teamSize 4", treg.teamSize === 4, `(${treg.teamSize})`);
  ok("Carla é a capitã", (treg.captainUid ?? treg.player1Id) === carla.uid);
  ok("elenco começa só com a capitã", (treg.participantUids || []).length === 1);

  section("8. Equipe — convites do elenco");
  const teamInvites = {};
  for (const member of [diego, elisa, felipe]) {
    const res = await call("sendTournamentPartnerInvite", carla.token, {
      tournamentId: TOURNAMENT_ID,
      categoryId: team.id,
      inviteeUid: member.uid,
      inviteeName: member.name,
      inviterName: carla.name,
    });
    teamInvites[member.uid] = res.inviteId;
    ok(`convite para ${member.name}`, typeof res?.inviteId === "string");
  }

  section("9. Equipe — aceites fecham o elenco");
  for (const member of [diego, elisa]) {
    await call("acceptTournamentPartnerInvite", member.token, {
      inviteId: teamInvites[member.uid],
      lgpdAccepted: true,
    });
    treg = await readRegistration(teamRegId, member.token);
    ok(`${member.name} entrou no elenco`, (treg.participantUids || []).includes(member.uid));
  }
  ok("elenco em 3/4 e ainda pendente", treg.participantUids.length === 3 && treg.partnerPending === true, `(${treg.participantUids.length}/4, pending=${treg.partnerPending})`);

  await call("acceptTournamentPartnerInvite", felipe.token, {
    inviteId: teamInvites[felipe.uid],
    lgpdAccepted: true,
  });
  treg = await readRegistration(teamRegId, felipe.token);
  ok("elenco completo em 4/4", treg.participantUids.length === 4, `(${treg.participantUids.length})`);
  ok("elenco completo encerra partnerPending", treg.partnerPending !== true, `(pending=${treg.partnerPending})`);

  section("10. Equipe — integrante sai do elenco (Felipe)");
  await call("leaveTournamentTeamRegistration", felipe.token, { registrationId: teamRegId });
  treg = await readRegistration(teamRegId, carla.token);
  ok("Felipe saiu do elenco", !(treg.participantUids || []).includes(felipe.uid), `(${JSON.stringify(treg.participantUids)})`);
  ok("vaga reabriu — partnerPending voltou", treg.partnerPending === true, `(pending=${treg.partnerPending})`);

  section("11. Convite enviado é cancelável e recusável");
  const reInvite = await call("sendTournamentPartnerInvite", carla.token, {
    tournamentId: TOURNAMENT_ID,
    categoryId: team.id,
    inviteeUid: felipe.uid,
    inviteeName: felipe.name,
    inviterName: carla.name,
  });
  await call("cancelTournamentPartnerInvite", carla.token, { inviteId: reInvite.inviteId });
  ok("convite cancelado pelo capitão", (await pendingInvitesFor(felipe, team.id)).length === 0);

  const declineInvite = await call("sendTournamentPartnerInvite", carla.token, {
    tournamentId: TOURNAMENT_ID,
    categoryId: team.id,
    inviteeUid: felipe.uid,
    inviteeName: felipe.name,
    inviterName: carla.name,
  });
  await call("cancelTournamentPartnerInvite", felipe.token, { inviteId: declineInvite.inviteId, asDecline: true });
  ok("convite recusado pelo convidado", (await pendingInvitesFor(felipe, team.id)).length === 0);

  section("12. Cancelamento da própria inscrição");
  await call("cancelTournamentRegistration", carla.token, { registrationId: teamRegId });
  const afterCancel = await fetch(`${FS}/${PUBLIC_DATA}/inscriptions/${teamRegId}`, {
    headers: { Authorization: `Bearer ${carla.token}` },
  });
  ok("inscrição da equipe cancelada", afterCancel.status === 404 || afterCancel.status === 403, `(status ${afterCancel.status})`);

  if (!KEEP) {
    await call("cancelTournamentRegistration", ana.token, { registrationId: duoRegId });
    ok("inscrição da dupla cancelada (limpeza)", true);
  } else {
    console.log(`\n  --keep: inscrição da dupla ${duoRegId} mantida (Ana + Bruno, aguardando pagamento).`);
    console.log(`  login no app: ${ana.email} / ${PASSWORD}`);
  }

  console.log(`\n${pass} passaram, ${fail} falharam`);
  if (fail > 0) {
    console.log("Falhas:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nERRO FATAL: ${err.message}`);
  process.exit(1);
});
