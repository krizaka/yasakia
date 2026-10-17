import { FACET_KEYS } from "@yasakia/ai";
import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { REQUIRED_BASICS } from "./agent-rules";
import { aiProvider, ConfigurationError } from "./env";

describe("the talk page's words", () => {
  it("has a label, in both languages, for every facet the agent can understand and every basic it can still ask for", () => {
    for (const messages of [en, fr]) {
      for (const key of FACET_KEYS) expect(messages.console.talk.facets, key).toHaveProperty(key);
      for (const basic of REQUIRED_BASICS) expect(messages.console.talk.basics, basic).toHaveProperty(basic);
    }
  });
  it("words every refusal the agent's routes can answer with a code", () => {
    for (const code of ["MESSAGE_LENGTH", "CONVERSATION_CLOSED", "BUDGET_SPENT", "TURN_IN_PROGRESS", "AI_UNAVAILABLE"]) {
      expect(en.console.errors, code).toHaveProperty(code);
      expect(fr.console.errors, code).toHaveProperty(code);
    }
  });
});

describe("the door to AI", () => {
  it("refuses to exist without the engine's address and key — no demo mode", () => {
    expect(() => aiProvider({})).toThrow(ConfigurationError);
    expect(() => aiProvider({ AI_ENGINE_URL: "https://engine.example/edge" })).toThrow(ConfigurationError);
    expect(() => aiProvider({ AI_ENGINE_API_KEY: "oz_x" })).toThrow(ConfigurationError);
  });
  it("is built from both, and a malformed timeout is a configuration error, not a default", () => {
    expect(aiProvider({ AI_ENGINE_URL: "https://engine.example/edge", AI_ENGINE_API_KEY: "oz_x" })).toHaveProperty("chat");
    expect(() => aiProvider({ AI_ENGINE_URL: "https://engine.example/edge", AI_ENGINE_API_KEY: "oz_x", AI_CHAT_TIMEOUT_SECONDS: "0" })).toThrow(ConfigurationError);
  });
});
