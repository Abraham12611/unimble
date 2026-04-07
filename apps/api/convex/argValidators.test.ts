import test from "node:test";
import assert from "node:assert/strict";

import { convexValidators } from "./argValidators";

type ValidatorJson = {
  type: string;
  value?: unknown;
};

function assertIsConvexValidator(
  value: unknown
): asserts value is { isConvexValidator: true; json: ValidatorJson } {
  assert.ok(typeof value === "object" && value !== null);
  assert.equal((value as { isConvexValidator?: unknown }).isConvexValidator, true);
  assert.ok("json" in value);
}

function assertIsUnionJson(
  json: ValidatorJson
): asserts json is { type: "union"; value: ValidatorJson[] } {
  assert.equal(json.type, "union");
  assert.ok(Array.isArray(json.value));
}

test("convexValidators exports Convex validators", () => {
  assertIsConvexValidator(convexValidators.nonEmptyString);
  assertIsConvexValidator(convexValidators.optionalString);
  assertIsConvexValidator(convexValidators.optionalNullableString);
  assertIsConvexValidator(convexValidators.userId);
});

test("optionalNullableString is union of string and null", () => {
  assertIsConvexValidator(convexValidators.optionalNullableString);
  const json = convexValidators.optionalNullableString.json;

  const unionJson = json.type === "optional" ? (json.value as ValidatorJson) : json;
  assertIsUnionJson(unionJson);

  const memberTypes = unionJson.value.map((m) => m.type).sort();
  assert.deepEqual(memberTypes, ["null", "string"]);
});
