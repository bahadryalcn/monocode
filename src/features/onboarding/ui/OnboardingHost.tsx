import { lazy, Suspense, useEffect, useState } from "react";
import {
  finishOnboarding,
  OPEN_ONBOARDING_EVENT,
  shouldShowOnboarding,
  type OnboardingContext,
} from "../model/onboarding";

const OnboardingDialog = lazy(() => import("./OnboardingDialog"));

export function OnboardingHost({
  context,
  onImported,
  onOpenProject,
}: {
  context: OnboardingContext;
  onImported: () => void;
  onOpenProject: (path: string) => void;
}) {
  const [open, setOpen] = useState(() => shouldShowOnboarding(context));
  useEffect(() => {
    // Record existing installations too: deleting their last project isn't a first run.
    if (!shouldShowOnboarding(context)) finishOnboarding();
    const show = () => setOpen(true);
    window.addEventListener(OPEN_ONBOARDING_EVENT, show);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, show);
  }, []); // The boot context is intentionally evaluated once per window.

  return open ? (
    <Suspense fallback={null}>
      <OnboardingDialog
        onImported={onImported}
        onOpenProject={onOpenProject}
        onFinish={() => {
          finishOnboarding();
          setOpen(false);
        }}
      />
    </Suspense>
  ) : null;
}
