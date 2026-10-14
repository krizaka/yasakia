import { krizakaUi } from "@krizaka/config/eslint/krizaka-ui";
import { krizakaNext } from "@krizaka/config/eslint/next";

const config = [
  ...krizakaNext,
  // The four UI rules of the Krizaka platform (no raw palette, no `light:`, no `[var(--…)]`, no className template):
  // errors from day one — the ratchet (lint-ratchet.json) starts and stays at zero.
  ...krizakaUi(),
  { ignores: [".next/**", ".next-e2e/**", ".next-e2e-closed/**", ".next-closed/**", "next-env.d.ts"] },
];

export default config;
