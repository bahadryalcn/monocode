import { useRef, useState, useSyncExternalStore } from "react";
import { loginHarness } from "../../../integrations/harness/core/auth";
import {
  getHarnessAvailabilitySnapshot,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
} from "../../../integrations/harness/core/availability";
import {
  ProviderSignInPanel,
  type ProviderSignInState,
} from "../../sessions/ui/ProviderSignInPanel";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { Group } from "./settingsControls";

export function GeminiAccountSettings() {
  useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
  );
  const [state, setState] = useState<ProviderSignInState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const available = isHarnessAvailable("gemini");

  async function signIn() {
    if (busy.current) return;
    busy.current = true;
    setState("running");
    setError(null);
    try {
      await loginHarness("gemini");
      setState("complete");
    } catch (reason) {
      setState("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not sign in to Gemini.",
      );
    } finally {
      busy.current = false;
    }
  }

  async function checkInstallation() {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      await probeHarnessAvailability({ force: true });
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  return (
    <Group
      id="gemini-account"
      title="Gemini account"
      description="Connect your Google account through Gemini CLI. After signing in, choose Gemini in the model picker. This uses the shared Gemini CLI profile on this computer."
    >
      {available ? (
        <ProviderSignInPanel
          harness="gemini"
          state={state}
          error={error}
          onSignIn={() => void signIn()}
          idleTitle="Connect your Google account"
          completeDescription="Gemini models are now available in the model picker."
        />
      ) : (
        <div className="space-y-3 px-4 py-4 text-[12px] text-content/60">
          <p>Install Gemini CLI, then check again to sign in with Google.</p>
          <code className="block select-text rounded-md bg-content/5 px-3 py-2 text-content">
            npm install -g @google/gemini-cli
          </code>
          <SecondaryButton
            disabled={checking}
            onClick={() => void checkInstallation()}
          >
            {checking ? "Checking…" : "Check installation"}
          </SecondaryButton>
        </div>
      )}
    </Group>
  );
}
