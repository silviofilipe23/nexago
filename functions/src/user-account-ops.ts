import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth, type UserRecord} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  rolesFromClaims,
  callerIsOrganizer,
  callerIsSuperAdmin,
  callerCanAccessBackoffice,
  applyRolesToClaims,
  firestoreRolesPayload,
} from "./auth-roles";

/** `auth.getUser(uid)` do próprio chamador: token ainda válido (JWT não
 *  expirou) mas a conta foi apagada depois que o cliente o obteve vira
 *  `auth/user-not-found` — sessão órfã, não um erro interno real. */
async function getCallerUserOrThrowUnauthenticated(callerUid: string) {
  try {
    return await getAuth().getUser(callerUid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
}

/**
 * Cria um novo organizador (admin sem superAdmin).
 * Apenas usuários com custom claim superAdmin === true podem chamar.
 */
export const createOrganizer = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getCallerUserOrThrowUnauthenticated(callerUid);
  if (callerUser.customClaims?.superAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode cadastrar organizadores."
    );
  }

  const {email, fullName, temporaryPassword} = request.data || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Nome completo é obrigatório.");
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Senha temporária deve ter no mínimo 6 caracteres.");
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(email.trim());
    throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw err;
    }
  }

  const userRecord = await auth.createUser({
    email: email.trim(),
    password: temporaryPassword,
    displayName: fullName.trim()
  });
  const uid = userRecord.uid;

  const adminClaims = applyRolesToClaims({mustChangePassword: true}, ["admin"]);
  await auth.setCustomUserClaims(uid, adminClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set({
    uid,
    email: email.trim(),
    fullName: fullName.trim(),
    ...firestoreRolesPayload(["admin"]),
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  logger.info(`Organizador criado: ${uid} (${email})`);
  return {uid, email: email.trim()};
});

/**
 * Cria um novo gestor de arena (arena).
 * Apenas usuários com custom claim superAdmin === true podem chamar.
 */
export const createArena = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getCallerUserOrThrowUnauthenticated(callerUid);
  if (callerUser.customClaims?.superAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode cadastrar gestores de arena."
    );
  }

  const {email, fullName, temporaryPassword, arenaName} = request.data || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Nome completo é obrigatório.");
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Senha temporária deve ter no mínimo 6 caracteres.");
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(email.trim());
    throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw err;
    }
  }

  const userRecord = await auth.createUser({
    email: email.trim(),
    password: temporaryPassword,
    displayName: fullName.trim()
  });
  const uid = userRecord.uid;

  const arenaClaims = applyRolesToClaims({mustChangePassword: true}, ["arena"]);
  await auth.setCustomUserClaims(uid, arenaClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set({
    uid,
    email: email.trim(),
    fullName: fullName.trim(),
    ...firestoreRolesPayload(["arena"]),
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  // Cria documento da arena vinculada ao gestor
  const arenaRef = db.collection("arenas").doc();
  await arenaRef.set({
    id: arenaRef.id,
    name: arenaName && typeof arenaName === "string" ? arenaName.trim() : "Minha Arena",
    managerUserId: uid,
    status: "active",
    basePriceReais: 0,
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  logger.info(`Gestor de arena criado: ${uid} (${email})`);
  return {uid, email: email.trim(), arenaId: arenaRef.id};
});

/** Rótulos em minúsculas para o filtro de busca (alinhado ao backoffice). */
const BO_ROLE_SEARCH_LABEL: Record<AppRole, string> = {
  admin: "organizador",
  organizer: "gestor torneios",
  athlete: "atleta",
  arena: "arena gestor",
  coach: "treinador",
};

function backofficeUserMatchesSearch(
  u: UserRecord,
  qLower: string,
  firestoreFullName: string | null,
): boolean {
  const roles = rolesFromClaims(u.customClaims);
  const pieces: string[] = [
    u.email ?? "",
    u.displayName ?? "",
    u.phoneNumber ?? "",
    firestoreFullName ?? "",
    u.uid,
    ...roles,
    ...roles.map((r) => BO_ROLE_SEARCH_LABEL[r]),
  ];
  const haystack = pieces.join(" ").toLowerCase();
  return haystack.includes(qLower);
}

async function fetchUserFullName(db: FirebaseFirestore.Firestore, uid: string): Promise<string | null> {
  try {
    const fsSnap = await db.doc(`users/${uid}`).get();
    const fn = fsSnap.data()?.["fullName"];
    return typeof fn === "string" ? fn : null;
  } catch {
    return null;
  }
}

function backofficeRowFromUserRecord(u: UserRecord, fullName: string | null) {
  const roles = rolesFromClaims(u.customClaims);
  const role = roles.length > 0 ? roles[0]! : null;
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    disabled: u.disabled === true,
    emailVerified: u.emailVerified === true,
    roles,
    role,
    fullName,
  };
}

type SearchListState =
  | {v: 1; kind: "scan"; authToken: string | undefined}
  | {v: 1; kind: "leftover"; uids: string[]; nextAuthToken: string | null};

function encodeBackofficeSearchState(s: SearchListState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

function decodeBackofficeSearchState(tok: string): SearchListState | null {
  try {
    const s = JSON.parse(Buffer.from(tok, "base64url").toString("utf8")) as SearchListState;
    if (s?.v !== 1) {
      return null;
    }
    if (s.kind === "scan") {
      return {v: 1, kind: "scan", authToken: s.authToken};
    }
    if (s.kind === "leftover" && Array.isArray(s.uids)) {
      return {v: 1, kind: "leftover", uids: s.uids, nextAuthToken: s.nextAuthToken};
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Lista usuários (Firebase Auth + enriquecimento Firestore) para o backoffice.
 * Apenas organizador (admin) ou super administrador.
 *
 * Com `search`, percorre todos os usuários do Auth (em lotes) até encher `maxResults`
 * ou esgotar a base; `nextPageToken` codifica continuação (inclui fila de UIDs pendentes).
 */
export const listBackofficeUsers = onCall({timeoutSeconds: 300}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getCallerUserOrThrowUnauthenticated(callerUid);
  if (!callerCanAccessBackoffice(callerUser)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem listar usuários.");
  }

  const raw = request.data as {maxResults?: unknown; pageToken?: unknown; search?: unknown} | undefined;
  const requested =
    typeof raw?.maxResults === "number" && Number.isFinite(raw.maxResults) ? raw.maxResults : 50;
  const maxResults = Math.min(Math.max(1, Math.floor(requested)), 100);
  const pageToken = typeof raw?.pageToken === "string" && raw.pageToken.trim() ? raw.pageToken : undefined;
  const searchRaw = typeof raw?.search === "string" ? raw.search.trim() : "";
  const searchQ = searchRaw.length > 0 ? searchRaw.toLowerCase() : "";

  const auth = getAuth();
  const db = getFirestore();

  try {
    if (searchQ) {
      const emailLike = searchRaw.includes("@");
      if (emailLike) {
        try {
          const u = await auth.getUserByEmail(searchRaw);
          const fullName = await fetchUserFullName(db, u.uid);
          return {
            users: [backofficeRowFromUserRecord(u, fullName)],
            nextPageToken: null,
          };
        } catch {
          // não encontrado por e-mail exato — segue para varredura
        }
      }
      const uidExact = /^[a-zA-Z0-9_-]{22,128}$/.test(searchRaw);
      if (uidExact) {
        try {
          const u = await auth.getUser(searchRaw);
          const fullName = await fetchUserFullName(db, u.uid);
          return {
            users: [backofficeRowFromUserRecord(u, fullName)],
            nextPageToken: null,
          };
        } catch {
          // segue para varredura (ex.: substring de UID)
        }
      }

      let state: SearchListState =
        pageToken ?
          decodeBackofficeSearchState(pageToken) ?? {v: 1, kind: "scan", authToken: undefined} :
          {v: 1, kind: "scan", authToken: undefined};

      const out: ReturnType<typeof backofficeRowFromUserRecord>[] = [];
      /** Limite de usuários Auth listados por chamada (evita timeout / custo). */
      let listedAuthUsers = 0;
      const MAX_LISTED_AUTH_PER_CALL = 25000;

      while (out.length < maxResults && listedAuthUsers < MAX_LISTED_AUTH_PER_CALL) {
        if (state.kind === "leftover") {
          while (state.uids.length > 0 && out.length < maxResults && listedAuthUsers < MAX_LISTED_AUTH_PER_CALL) {
            const uid = state.uids.shift()!;
            const u = await auth.getUser(uid);
            listedAuthUsers++;
            const fullName = await fetchUserFullName(db, u.uid);
            out.push(backofficeRowFromUserRecord(u, fullName));
          }
          if (state.uids.length > 0) {
            return {
              users: out,
              nextPageToken: encodeBackofficeSearchState(state),
            };
          }
          if (!state.nextAuthToken) {
            return {users: out, nextPageToken: null};
          }
          state = {v: 1, kind: "scan", authToken: state.nextAuthToken};
          continue;
        }

        const listResult = await auth.listUsers(1000, state.authToken);
        listedAuthUsers += listResult.users.length;

        const refs = listResult.users.map((u) => db.doc(`users/${u.uid}`));
        const snaps = refs.length > 0 ? await db.getAll(...refs) : [];
        const fullNameByUid = new Map<string, string | null>();
        snaps.forEach((snap, i) => {
          const u = listResult.users[i];
          if (!u) {
            return;
          }
          const fn = snap.data()?.["fullName"];
          fullNameByUid.set(u.uid, typeof fn === "string" ? fn : null);
        });

        const matching: UserRecord[] = [];
        for (const u of listResult.users) {
          const fn = fullNameByUid.get(u.uid) ?? null;
          if (backofficeUserMatchesSearch(u, searchQ, fn)) {
            matching.push(u);
          }
        }

        let mi = 0;
        while (mi < matching.length && out.length < maxResults) {
          const u = matching[mi]!;
          mi++;
          const fullName = fullNameByUid.get(u.uid) ?? null;
          out.push(backofficeRowFromUserRecord(u, fullName));
        }

        const leftoverUids = matching.slice(mi).map((u) => u.uid);
        const nextAuth = listResult.pageToken ?? null;

        if (leftoverUids.length > 0) {
          return {
            users: out,
            nextPageToken: encodeBackofficeSearchState({
              v: 1,
              kind: "leftover",
              uids: leftoverUids,
              nextAuthToken: nextAuth,
            }),
          };
        }

        if (!nextAuth) {
          return {users: out, nextPageToken: null};
        }

        if (out.length >= maxResults) {
          return {
            users: out,
            nextPageToken: encodeBackofficeSearchState({v: 1, kind: "scan", authToken: nextAuth}),
          };
        }

        if (listedAuthUsers >= MAX_LISTED_AUTH_PER_CALL) {
          return {
            users: out,
            nextPageToken: encodeBackofficeSearchState({v: 1, kind: "scan", authToken: nextAuth}),
          };
        }

        state = {v: 1, kind: "scan", authToken: nextAuth};
      }

      return {
        users: out,
        nextPageToken:
          listedAuthUsers >= MAX_LISTED_AUTH_PER_CALL && state.kind === "scan" && state.authToken ?
            encodeBackofficeSearchState(state) :
            null,
      };
    }

    const listResult = await auth.listUsers(maxResults, pageToken);

    const users = await Promise.all(
      listResult.users.map(async (u) => {
        const fullName = await fetchUserFullName(db, u.uid);
        return backofficeRowFromUserRecord(u, fullName);
      }),
    );

    return {
      users,
      nextPageToken: listResult.pageToken ?? null,
    };
  } catch (err) {
    logger.error("listBackofficeUsers failed", err);
    throw new HttpsError("internal", "Não foi possível listar usuários.");
  }
});

/**
 * Remove a flag mustChangePassword do custom claim do usuário
 * Apenas o próprio usuário ou um admin pode chamar esta função
 */
export const clearMustChangePassword = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const {uid} = request.data || {};
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID é obrigatório");
  }

  // Verifica se o caller é o próprio usuário ou um admin
  const callerUser = await getCallerUserOrThrowUnauthenticated(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);
  const isSelf = callerUid === uid;

  if (!isAdmin && !isSelf) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas o próprio usuário ou um admin pode remover esta flag");
  }

  // Obtém os claims atuais do usuário
  const targetUser = await getAuth().getUser(uid);
  const currentClaims = targetUser.customClaims || {};

  // Remove mustChangePassword mantendo os outros claims
  const {mustChangePassword, ...remainingClaims} = currentClaims;

  // Atualiza os custom claims sem mustChangePassword
  await getAuth().setCustomUserClaims(uid, remainingClaims);

  logger.info(`Flag mustChangePassword removida para usuário ${uid}`);
  return {success: true};
});

/**
 * Obtém o role de um usuário pelos custom claims
 */
export const getUserRole = onCall(async (request) => {
  const {uid} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new Error("Usuário não autenticado");
  }

  // Usuário pode ver seu próprio role ou deve ser admin ou super admin
  const callerUser = await getCallerUserOrThrowUnauthenticated(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);
  const isSuperAdmin = callerIsSuperAdmin(callerUser);

  if (callerUid !== uid && !isAdmin && !isSuperAdmin) {
    throw new Error("Permissão negada");
  }

  try {
    const user = await getAuth().getUser(uid);
    const roles = rolesFromClaims(user.customClaims);
    return {
      roles,
      role: roles[0] ?? null,
    };
  } catch (error) {
    logger.error("Erro ao obter role:", error);
    throw new Error("Erro ao obter role do usuário");
  }
});

/**
 * Define ou atualiza o status PRO de um atleta
 * Apenas admins podem chamar
 */
export const setAthletePro = onCall(async (request) => {
  const {uid, isPro, expiresAt} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof isPro !== "boolean") {
    throw new HttpsError("invalid-argument", "isPro inválido");
  }
  if (expiresAt !== undefined && (typeof expiresAt !== "number" || Number.isNaN(expiresAt))) {
    throw new HttpsError("invalid-argument", "expiresAt inválido");
  }

  // Apenas admin pode alterar status PRO
  const auth = getAuth();
  const callerUser = await getCallerUserOrThrowUnauthenticated(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada");
  }

  // Atualiza custom claims sem remover claims existentes
  const targetUser = await auth.getUser(uid);
  const claims: Record<string, unknown> = {...(targetUser.customClaims || {}), athletePro: isPro};
  if (expiresAt) {
    claims.athleteProExpiresAt = expiresAt;
  } else if (!isPro) {
    // Remove expiração se não é PRO
    claims.athleteProExpiresAt = null;
  }

  await auth.setCustomUserClaims(uid, claims);

  // Atualiza Firestore
  const db = getFirestore();
  const updateData: any = {
    isPro,
    updatedAt: FieldValue.serverTimestamp()
  };

  if (isPro && !expiresAt) {
    // Se está ativando PRO e não tem data de expiração, marca como ativado agora
    const proProfileRef = db.doc(`athlete_profiles/${uid}`);
    const proProfile = await proProfileRef.get();
    
    if (!proProfile.exists || !proProfile.data()?.proActivatedAt) {
      updateData.proActivatedAt = FieldValue.serverTimestamp();
    }
  }

  if (expiresAt) {
    updateData.subscriptionEndDate = new Date(expiresAt * 1000);
  }

  await db.doc(`athlete_profiles/${uid}`).set(updateData, {merge: true});

  logger.info(`Status PRO ${isPro ? 'ativado' : 'desativado'} para usuário ${uid}`);

  return {success: true, message: "Status PRO atualizado"};
});
