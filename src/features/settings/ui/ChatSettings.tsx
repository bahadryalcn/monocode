import { t, useLocale } from "../../../shared/i18n";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import { useEffect, useState } from "react";

import {
  loadTranscriptLayout,
  loadTranscriptAnchor,
  saveTranscriptLayout,
  saveTranscriptAnchor,
  TRANSCRIPT_ANCHOR_CHANGE_EVENT,
  type TranscriptLayout,
} from "../model/appearance";

import {
  loadDiffViewer,
  loadFollowUpBehavior,
  loadAutoContinueInterrupted,
  loadResumeAtReset,
  loadFormatOnSave,
  loadCoffeehouseSceneEnabled,
  loadModelControls,
  saveDiffViewer,
  saveFollowUpBehavior,
  saveAutoContinueInterrupted,
  saveResumeAtReset,
  saveFormatOnSave,
  saveCoffeehouseSceneEnabled,
  saveModelControls,
  type DiffViewer,
  type FollowUpBehavior,
  type ModelControls,
} from "../model/settings";

import { Group, Row, Segmented, Toggle } from "./settingsControls";

export function ChatPage() {
  useLocale();
  const [transcriptLayout, setTranscriptLayout] =
    useState<TranscriptLayout>(loadTranscriptLayout);
  const [transcriptAnchor, setTranscriptAnchor] =
    useState(loadTranscriptAnchor);
  const [followUpBehavior, setFollowUpBehavior] =
    useState<FollowUpBehavior>(loadFollowUpBehavior);
  const [resumeAtReset, setResumeAtReset] = useState(loadResumeAtReset);
  const [autoContinue, setAutoContinue] = useState(loadAutoContinueInterrupted);
  const [modelControls, setModelControls] =
    useState<ModelControls>(loadModelControls);
  const [diffViewer, setDiffViewer] = useState<DiffViewer>(loadDiffViewer);
  const [formatOnSave, setFormatOnSave] = useState(loadFormatOnSave);
  const [coffeehouseSceneEnabled, setCoffeehouseSceneEnabled] = useState(
    loadCoffeehouseSceneEnabled,
  );

  useEffect(() => {
    const onAnchor = (event: Event) => {
      setTranscriptAnchor((event as CustomEvent<boolean>).detail === true);
    };
    window.addEventListener(TRANSCRIPT_ANCHOR_CHANGE_EVENT, onAnchor);
    return () => {
      window.removeEventListener(TRANSCRIPT_ANCHOR_CHANGE_EVENT, onAnchor);
    };
  }, []);

  const onTranscriptLayout = (next: TranscriptLayout) => {
    saveTranscriptLayout(next);
    setTranscriptLayout(next);
  };

  const onTranscriptAnchor = (next: boolean) => {
    saveTranscriptAnchor(next);
    setTranscriptAnchor(next);
  };

  const onFollowUpBehavior = (next: FollowUpBehavior) => {
    saveFollowUpBehavior(next);
    setFollowUpBehavior(next);
  };

  const onResumeAtReset = (next: boolean) => {
    saveResumeAtReset(next);
    setResumeAtReset(next);
  };

  const onAutoContinue = (next: boolean) => {
    saveAutoContinueInterrupted(next);
    setAutoContinue(next);
  };

  const onModelControls = (next: ModelControls) => {
    saveModelControls(next);
    setModelControls(next);
  };

  const onDiffViewer = (next: DiffViewer) => {
    saveDiffViewer(next);
    setDiffViewer(next);
  };

  const onFormatOnSave = (next: boolean) => {
    saveFormatOnSave(next);
    setFormatOnSave(next);
  };

  const onCoffeehouseSceneEnabled = (next: boolean) => {
    saveCoffeehouseSceneEnabled(next);
    setCoffeehouseSceneEnabled(next);
  };

  return (
    <>
      <Group
        title={t("Transcript")}
        description={t("How a conversation reads as it grows.")}
      >
        <Row
          id="transcript-layout"
          label={t("Transcript layout")}
          description={t("Full width keeps user prompts as a spanning card. Chat aligns them to the right with a max width, like a messaging app.")}
        >
          <Segmented
            label={t("Transcript layout")}
            value={transcriptLayout}
            options={[
              { value: "full", get label() { return t("Full width"); } },
              { value: "chat", get label() { return t("Chat"); } },
            ]}
            onChange={onTranscriptLayout}
          />
        </Row>
        <Row
          id="anchor-prompts"
          label={t("Anchor prompts to top")}
          description={t("When you send, the new prompt sits at the top of the transcript and the reply grows into the space below. Turn this off to keep the classic layout, with the latest message resting on the composer.")}
        >
          <Toggle
            label={t("Anchor prompts to top")}
            on={transcriptAnchor}
            onChange={onTranscriptAnchor}
          />
        </Row>
      </Group>

      <Group
        title={t("Composer")}
        description={t("What the composer does with what you type.")}
      >
        <Row
          id="follow-up"
          label={t("Follow-up behavior")}
          description={t("Queue follow-ups until the active turn finishes, or steer the active turn immediately.")}
        >
          <Segmented
            label={t("Follow-up behavior")}
            value={followUpBehavior}
            options={[
              { value: "queue", get label() { return t("Queue"); } },
              { value: "steer", get label() { return t("Steer"); } },
            ]}
            onChange={onFollowUpBehavior}
          />
        </Row>
        <Row
          id="resume-at-reset"
          label={t("Resume at reset")}
          description={t("When a provider stops a turn at its usage limit, continue the session automatically once the limit resets. You can still cancel it from the notice above the composer.")}
        >
          <Toggle
            label={t("Resume at reset")}
            on={resumeAtReset}
            onChange={onResumeAtReset}
          />
        </Row>
        <Row
          id="auto-continue-interrupted"
          label={t("Automatically continue interrupted turns")}
          description={t("When {p0} quit in the middle of a turn and the transcript shows it was cut off, send Continue at the next launch. Turns that finished or are still running are never continued, and nothing is sent when you have queued messages. When off, the chat shows an Interrupted - Continue action instead.", { p0: PRODUCT_IDENTITY.displayName })}
        >
          <Toggle
            label={t("Automatically continue interrupted turns")}
            on={autoContinue}
            onChange={onAutoContinue}
          />
        </Row>
        <Row
          id="model-controls"
          label={t("Model controls")}
          description={t("Show model options beside the picker instead of inside the model menu.")}
        >
          <Segmented
            label={t("Model controls")}
            value={modelControls}
            options={[
              { value: "menu", get label() { return t("Menu"); } },
              { value: "beside", get label() { return t("Beside"); } },
            ]}
            onChange={onModelControls}
          />
        </Row>
      </Group>

      <Group
        title={t("Editor")}
        description={t("What happens when you save a file in the workspace editor.")}
      >
        <Row
          id="format-on-save"
          label={t("Format on save")}
          description={t("Run Prettier on supported files before writing. Off keeps the text you typed, including quote style.")}
        >
          <Toggle
            label={t("Format on save")}
            on={formatOnSave}
            onChange={onFormatOnSave}
          />
        </Row>
      </Group>

      <Group
        title={t("Code review")}
        description={t("Where a turn's changes open when you go to read them.")}
      >
        <Row
          id="diff-view"
          label={t("Diff view")}
          description={t("Editor keeps working-tree changes in the file. Unified stacks every changed file in one review, with sticky headers and collapsed unchanged lines.")}
        >
          <Segmented
            label={t("Diff view")}
            value={diffViewer}
            options={[
              { value: "editor", get label() { return t("Editor"); } },
              { value: "unified", get label() { return t("Unified"); } },
            ]}
            onChange={onDiffViewer}
          />
        </Row>
      </Group>

      <Group
        title={t("Extras")}
        description={t("Monochrome code art in new tasks and behind conversations.")}
      >
        <Row
          id="coffeehouse-scene"
          label={t("Village coffeehouse")}
          description={t("Show six coffeehouse regulars holding tea beside a backgammon table. Decorative animations controls their occasional tea sips.")}
        >
          <Toggle
            label={t("Village coffeehouse")}
            on={coffeehouseSceneEnabled}
            onChange={onCoffeehouseSceneEnabled}
          />
        </Row>
      </Group>
    </>
  );
}
