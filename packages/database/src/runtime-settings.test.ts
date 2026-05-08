import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_RUNTIME_SETTING_KEYS,
  decryptRuntimeSettingValue,
  encryptRuntimeSettingValue,
  isSecretRuntimeSetting,
} from "./runtime-settings";

test("runtime AI settings include embedding key and model", () => {
  assert.ok(AI_RUNTIME_SETTING_KEYS.includes("GOOGLE_AI_API_KEY"));
  assert.ok(AI_RUNTIME_SETTING_KEYS.includes("GEMINI_EMBEDDING_MODEL"));
});

test("runtime setting secrets are encrypted and decryptable", () => {
  const encrypted = encryptRuntimeSettingValue("secret-value", "test-key-material");

  assert.notEqual(encrypted, "secret-value");
  assert.equal(decryptRuntimeSettingValue(encrypted, "test-key-material"), "secret-value");
  assert.equal(isSecretRuntimeSetting("GOOGLE_AI_API_KEY"), true);
  assert.equal(isSecretRuntimeSetting("GEMINI_EMBEDDING_MODEL"), false);
});
