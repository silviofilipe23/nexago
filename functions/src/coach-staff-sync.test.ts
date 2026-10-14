import {strict as assert} from "node:assert";
import {test} from "node:test";
import {buildCoachStaffMirrorData} from "./coach-staff-sync";

test("espelho leva cargo e nome do treinador", () => {
  assert.deepEqual(
    buildCoachStaffMirrorData({role: "fisioterapeuta"}, {displayName: "Carla Mendes", photoUrl: "https://x/y.png"}),
    {role: "fisioterapeuta", coachName: "Carla Mendes", coachPhotoUrl: "https://x/y.png"},
  );
});

test("cargo invalido no doc vira string vazia (o portal nao libera nada por ele)", () => {
  assert.equal(buildCoachStaffMirrorData({role: "dono"}, {}).role, "");
  assert.equal(buildCoachStaffMirrorData({}, {}).role, "");
});

test("sem nome ou foto: defaults seguros", () => {
  const m = buildCoachStaffMirrorData({role: "auxiliar"}, {});
  assert.equal(m.coachName, "");
  assert.equal(m.coachPhotoUrl, null);
});
