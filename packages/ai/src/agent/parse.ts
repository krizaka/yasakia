import type { z } from "zod";

import { AiFailure, AiUnavailableError } from "../provider/provider.types";

/** The first JSON object in a model's answer (it may wrap it in a code fence or a sentence), or null. */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** A model's answer parsed against a schema: a typed `bad_response` when it does not fit (the caller retries or gives up). */
export function parseModel<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> {
  const json = firstJsonObject(text);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Where it does not fit — field paths and rule names only, never a value (a person's words stay out of the logs).
    const where = json === null ? "no JSON object" : parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join(", ");
    throw new AiUnavailableError(AiFailure.BadResponse, `The model's answer does not fit the expected shape (${where})`);
  }
  return parsed.data;
}
