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
        title="Transcript"
        description="How a conversation reads as it grows."
      >
        <Row
          id="transcript-layout"
          label="Transcript layout"
          description="Full width keeps user prompts as a spanning card. Chat aligns them to the right with a max width, like a messaging app."
        >
          <Segmented
            label="Transcript layout"
            value={transcriptLayout}
            options={[
              { value: "full", label: "Full width" },
              { value: "chat", label: "Chat" },
            ]}
            onChange={onTranscriptLayout}
          />
        </Row>
        <Row
          id="anchor-prompts"
          label="Anchor prompts to top"
          description="When you send, the new prompt sits at the top of the transcript and the reply grows into the space below. Turn this off to keep the classic layout, with the latest message resting on the composer."
        >
          <Toggle
            label="Anchor prompts to top"
            on={transcriptAnchor}
            onChange={onTranscriptAnchor}
          />
        </Row>
      </Group>

      <Group
        title="Composer"
        description="What the composer does with what you type."
      >
        <Row
          id="follow-up"
          label="Follow-up behavior"
          description="Queue follow-ups until the active turn finishes, or steer the active turn immediately."
        >
          <Segmented
            label="Follow-up behavior"
            value={followUpBehavior}
            options={[
              { value: "queue", label: "Queue" },
              { value: "steer", label: "Steer" },
            ]}
            onChange={onFollowUpBehavior}
          />
        </Row>
        <Row
          id="resume-at-reset"
          label="Resume at reset"
          description="When a provider stops a turn at its usage limit, continue the session automatically once the limit resets. You can still cancel it from the notice above the composer."
        >
          <Toggle
            label="Resume at reset"
            on={resumeAtReset}
            onChange={onResumeAtReset}
          />
        </Row>
        <Row
          id="auto-continue-interrupted"
          label="Automatically continue interrupted turns"
          description={`When ${PRODUCT_IDENTITY.displayName} quit in the middle of a turn and the transcript shows it was cut off, send Continue at the next launch. Turns that finished or are still running are never continued, and nothing is sent when you have queued messages. When off, the chat shows an Interrupted - Continue action instead.`}
        >
          <Toggle
            label="Automatically continue interrupted turns"
            on={autoContinue}
            onChange={onAutoContinue}
          />
        </Row>
        <Row
          id="model-controls"
          label="Model controls"
          description="Show model options beside the picker instead of inside the model menu."
        >
          <Segmented
            label="Model controls"
            value={modelControls}
            options={[
              { value: "menu", label: "Menu" },
              { value: "beside", label: "Beside" },
            ]}
            onChange={onModelControls}
          />
        </Row>
      </Group>

      <Group
        title="Editor"
        description="What happens when you save a file in the workspace editor."
      >
        <Row
          id="format-on-save"
          label="Format on save"
          description="Run Prettier on supported files before writing. Off keeps the text you typed, including quote style."
        >
          <Toggle
            label="Format on save"
            on={formatOnSave}
            onChange={onFormatOnSave}
          />
        </Row>
      </Group>

      <Group
        title="Code review"
        description="Where a turn's changes open when you go to read them."
      >
        <Row
          id="diff-view"
          label="Diff view"
          description="Editor keeps working-tree changes in the file. Unified stacks every changed file in one review, with sticky headers and collapsed unchanged lines."
        >
          <Segmented
            label="Diff view"
            value={diffViewer}
            options={[
              { value: "editor", label: "Editor" },
              { value: "unified", label: "Unified" },
            ]}
            onChange={onDiffViewer}
          />
        </Row>
      </Group>

      <Group
        title="Extras"
        description="Monochrome code art in new tasks and behind conversations."
      >
        <Row
          id="coffeehouse-scene"
          label="Village coffeehouse"
          description="Show six coffeehouse regulars holding tea beside a backgammon table. Decorative animations controls their occasional tea sips."
        >
          <Toggle
            label="Village coffeehouse"
            on={coffeehouseSceneEnabled}
            onChange={onCoffeehouseSceneEnabled}
          />
        </Row>
      </Group>
    </>
  );
}
