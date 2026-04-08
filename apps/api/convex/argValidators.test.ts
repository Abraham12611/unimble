import { describe, expect, test } from "vitest";

import { convexValidators } from "./argValidators";

type ValidatorJson = {
  type: string;
  value?: unknown;
};

function assertIsConvexValidator(
  value: unknown
): asserts value is { isConvexValidator: true; json: ValidatorJson } {
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  expect((value as { isConvexValidator?: unknown }).isConvexValidator).toBe(true);
  expect("json" in (value as object)).toBe(true);
}

function assertIsUnionJson(
  json: ValidatorJson
): asserts json is { type: "union"; value: ValidatorJson[] } {
  expect(json.type).toBe("union");
  expect(Array.isArray(json.value)).toBe(true);
}

describe("argValidators", () => {
  test("convexValidators exports Convex validators", () => {
    assertIsConvexValidator(convexValidators.stringField);
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
    expect(memberTypes).toEqual(["null", "string"]);
  });
});
