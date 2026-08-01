import {strict as assert} from "node:assert";
import {test} from "node:test";
import {
  arenaStaffRoleLabel,
  buildArenaStaffAddedBody,
  buildArenaStaffMirrorData,
} from "./arena-staff-sync";

test("rotulo em pt-BR de cada cargo", () => {
  assert.equal(arenaStaffRoleLabel("gestor"), "gestor");
  assert.equal(arenaStaffRoleLabel("recepcao"), "recepção");
  assert.equal(arenaStaffRoleLabel("financeiro"), "financeiro");
  assert.equal(arenaStaffRoleLabel("manutencao"), "manutenção");
});

test("cargo desconhecido cai em membro", () => {
  assert.equal(arenaStaffRoleLabel("sindico"), "membro");
});

test("corpo da notificacao usa o nome da arena", () => {
  assert.equal(
    buildArenaStaffAddedBody("recepcao", "Arena CFC"),
    "Você agora é recepção da Arena CFC",
  );
});

test("corpo da notificacao sem nome tem fallback", () => {
  assert.equal(
    buildArenaStaffAddedBody("gestor", "   "),
    "Você agora é gestor de uma arena",
  );
});

test("espelho carrega cargo, status e marca da arena", () => {
  const mirror = buildArenaStaffMirrorData(
    {role: "financeiro", status: "active"},
    {name: "Arena CFC", logoUrl: "https://x/y.png"},
  );
  assert.equal(mirror.role, "financeiro");
  assert.equal(mirror.status, "active");
  assert.equal(mirror.arenaName, "Arena CFC");
  assert.equal(mirror.arenaLogoUrl, "https://x/y.png");
});

test("espelho tem defaults quando o doc esta incompleto", () => {
  const mirror = buildArenaStaffMirrorData({}, {});
  assert.equal(mirror.role, "recepcao");
  assert.equal(mirror.status, "active");
  assert.equal(mirror.arenaName, "");
  assert.equal(mirror.arenaLogoUrl, null);
});

test("espelho aceita logo em logo ou coverUrl, na mesma ordem do portal", () => {
  assert.equal(
    buildArenaStaffMirrorData({}, {logo: "https://x/logo.png"}).arenaLogoUrl,
    "https://x/logo.png",
  );
  assert.equal(
    buildArenaStaffMirrorData({}, {coverUrl: "https://x/capa.png"}).arenaLogoUrl,
    "https://x/capa.png",
  );
});
