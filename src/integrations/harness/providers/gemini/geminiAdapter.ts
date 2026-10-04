import * as gemini from "./gemini";
import { refreshGeminiCatalog } from "./geminiCatalog";
import { registerHarness, type HarnessAdapter } from "../../core/registry";
export const geminiAdapter: HarnessAdapter = {
  id: "gemini",
  live: true,
  canSteer: false,
  sendTurn: gemini.sendGeminiTurn,
  steerTurn: gemini.steerGeminiTurn,
  cancelTurn: gemini.cancelGeminiTurn,
  respondApproval: gemini.respondGeminiApproval,
  stopSession: gemini.stopGeminiSession,
  forgetSession: gemini.forgetGeminiSession,
  bindSession: gemini.bindGeminiSession,
  refreshCatalog: refreshGeminiCatalog,
};
let registered = false;
export function ensureGeminiRegistered(): void {
  if (registered) return;
  registerHarness(geminiAdapter);
  registered = true;
}
