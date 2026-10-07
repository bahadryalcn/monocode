import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import { ImagePlus, Loader } from "../../../shared/ui/icons";
import { useContext, useRef, useState } from "react";
import {
  AppearanceStudio,
  AppearanceInterface,
  AppearanceTypography,
} from "./AppearancePreviews";

import {
  ColorPickerPopover,
  ColorSwatchRow,
} from "../../../shared/ui/ColorPickerPopover";
import { Popover } from "../../../shared/ui/Popover";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";

import { GradientBlurBackground } from "./GradientBlurBackground";

import { useColorScheme } from "../../../shared/hooks/useColorScheme";
import {
  ACCENT_COLOR_DEFAULT,
  CHAT_BACKGROUND_BLUR_MAX,
  CHAT_BACKGROUND_BLUR_MIN,
  CHAT_BACKGROUND_OPACITY_MAX,
  CHAT_BACKGROUND_OPACITY_MIN,
  chatBackgroundSrc,
  SIDEBAR_BLUR_MAX,
  SIDEBAR_BLUR_MIN,
  MAIN_OPACITY_MAX,
  MAIN_OPACITY_MIN,
  SIDEBAR_OPACITY_MAX,
  SIDEBAR_OPACITY_MIN,
  THEME_DARK_LIGHTNESS_MAX,
  THEME_DARK_LIGHTNESS_MIN,
  THEME_HUE_MAX,
  THEME_HUE_MIN,
  THEME_SATURATION_MAX,
  THEME_SATURATION_MIN,
  NEW_THREAD_BACKGROUND_EFFECTS,
  NEW_THREAD_BACKGROUND_EFFECT_LABELS,
  NEW_THREAD_BACKGROUND_EFFECT_DESCRIPTIONS,
} from "../model/appearance";

import { UI_SCALE_PERCENTS } from "../model/uiScale";
import {
  saveDecorativeMotionEnabled,
  useDecorativeMotionPreference,
  usePrefersReducedMotion,
} from "../model/decorativeMotion";

import {
  Group,
  RevealedSetting,
  Row,
  Segmented,
  Slider,
  Toggle,
  Select,
} from "./settingsControls";
import { type AppearanceSettings } from "./useAppearanceSettings";

export function AppearancePage({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const revealed = useContext(RevealedSetting);
  const [advanced, setAdvanced] = useState(false);
  const showAdvanced =
    advanced ||
    [
      "accent-color",
      "hue",
      "saturation",
      "dark-lightness",
      "sidebar-opacity",
      "blur",
      "main-pane-glass",
      "main-pane-opacity",
    ].includes(revealed ?? "");
  const percent = Math.round(appearance.opacity * 100);
  const mainPercent = Math.round(appearance.mainOpacity * 100);
  const glassDisabled = useColorScheme() === "light";
  const decorativeMotion = useDecorativeMotionPreference();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <>
      <AppearanceStudio appearance={appearance} />
      <div className="appearance-tuning">
        <AppearanceInterface appearance={appearance} />
        <AppearanceTypography appearance={appearance} />
      </div>
      <div className="mt-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold">Custom colors & glass</h2>
          <p className="mt-1 text-[12px] text-content/45">
            Fine-tune the palette and desktop transparency.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-content/10 px-3 py-1.5 text-[12px]"
          aria-expanded={showAdvanced}
          aria-controls="appearance-advanced"
          onClick={() => setAdvanced(!showAdvanced)}
        >
          Advanced {showAdvanced ? "−" : "+"}
        </button>
      </div>
      <div id="appearance-advanced" hidden={!showAdvanced}>
        <Group title="Accent">
          <Row
            id="accent-color"
            label="Accent color"
            description="Used for the composer send button and your message bubbles."
          >
            <AccentColorPicker
              value={appearance.accentColor}
              onChange={appearance.onAccentColor}
            />
          </Row>
        </Group>

        <Group
          title="Color"
          description="Hue and saturation tint every surface. Lightness only moves the dark theme."
        >
          <Row
            id="hue"
            label="Hue"
            description="Base hue for accents and tinted surfaces."
          >
            <Slider
              label="Hue"
              value={appearance.themeHue}
              display={`${appearance.themeHue}°`}
              min={THEME_HUE_MIN}
              max={THEME_HUE_MAX}
              onChange={(value) =>
                appearance.onTint(value, appearance.themeSaturation)
              }
            />
          </Row>
          <Row
            id="saturation"
            label="Saturation"
            description="How strongly the hue tints the interface. Zero keeps it neutral."
          >
            <Slider
              label="Saturation"
              value={appearance.themeSaturation}
              display={`${appearance.themeSaturation}%`}
              min={THEME_SATURATION_MIN}
              max={THEME_SATURATION_MAX}
              onChange={(value) =>
                appearance.onTint(appearance.themeHue, value)
              }
            />
          </Row>
          <Row
            id="dark-lightness"
            label="Dark-mode lightness"
            description={
              glassDisabled
                ? "This only affects dark mode. Your dark-mode value is preserved."
                : "Base brightness of the dark theme. Lower values are darker; zero is true black."
            }
          >
            <Slider
              label="Dark-mode lightness"
              value={appearance.themeDarkLightness}
              display={`${appearance.themeDarkLightness}%`}
              min={THEME_DARK_LIGHTNESS_MIN}
              max={THEME_DARK_LIGHTNESS_MAX}
              onChange={appearance.onDarkLightness}
              disabled={glassDisabled}
            />
          </Row>
        </Group>

        <Group
          title="Translucency"
          description={
            glassDisabled
              ? "Light mode always uses an opaque window, so these are off. Your dark-mode values are preserved."
              : `How much of the desktop shows through ${PRODUCT_IDENTITY.displayName}. Blur costs more to composite the higher it goes.`
          }
        >
          <Row
            id="sidebar-opacity"
            label="Sidebar opacity"
            description="Applies to the project rail and the session sidebar."
          >
            <Slider
              label="Sidebar opacity"
              value={percent}
              display={`${percent}%`}
              min={Math.round(SIDEBAR_OPACITY_MIN * 100)}
              max={Math.round(SIDEBAR_OPACITY_MAX * 100)}
              onChange={appearance.onOpacity}
              disabled={glassDisabled}
            />
          </Row>
          <Row
            id="blur"
            label="Blur radius"
            description="Background blur behind the window."
          >
            <Slider
              label="Blur radius"
              value={appearance.blur}
              display={String(appearance.blur)}
              min={SIDEBAR_BLUR_MIN}
              max={SIDEBAR_BLUR_MAX}
              onChange={appearance.onBlur}
              disabled={glassDisabled}
            />
          </Row>
          <Row
            id="main-pane-glass"
            label="Main pane glass"
            description="Extend the translucent treatment to the main pane behind sessions and editors."
          >
            <Toggle
              label="Main pane glass"
              on={appearance.bodyGlass}
              onChange={appearance.onBodyGlass}
              disabled={glassDisabled}
            />
          </Row>
          <Row
            id="main-pane-opacity"
            label="Main pane opacity"
            description="Applies to the main pane when main pane glass is on."
          >
            <Slider
              label="Main pane opacity"
              value={mainPercent}
              display={`${mainPercent}%`}
              min={Math.round(MAIN_OPACITY_MIN * 100)}
              max={Math.round(MAIN_OPACITY_MAX * 100)}
              onChange={appearance.onMainOpacity}
              disabled={glassDisabled || !appearance.bodyGlass}
            />
          </Row>
        </Group>
      </div>
      <Group title="Motion">
        <Row
          id="decorative-motion"
          label="Decorative animations"
          description={
            reducedMotion
              ? "Your system requests reduced motion, so decorative animations stay still. Your saved choice is preserved."
              : "Animate project sigils, chat transitions and the village coffeehouse scene."
          }
        >
          <Toggle
            label="Decorative animations"
            on={decorativeMotion}
            onChange={saveDecorativeMotionEnabled}
          />
        </Row>
      </Group>
      <ChatBackgroundCard appearance={appearance} />

      <Group title="Layout">
        <Row
          id="collapsed-project-rail"
          label="Collapsed project rail"
          description="Keep project navigation available as a compact icon rail, or hide the rail completely."
        >
          <Segmented
            label="Collapsed project rail"
            value={appearance.collapsedProjectRailMode}
            options={[
              { value: "compact", label: "Icon rail" },
              { value: "hidden", label: "Hidden" },
            ]}
            onChange={appearance.onCollapsedProjectRailMode}
          />
        </Row>
        <Row
          id="interface-scale"
          label="Interface scale"
          description="Zoom the whole interface. You can also use Ctrl+=, Ctrl+-, and Ctrl+0 (Cmd on macOS)."
        >
          <Select
            label="Interface scale"
            value={String(Math.round(appearance.uiScale * 100))}
            options={UI_SCALE_PERCENTS.map((percent) => ({
              value: String(percent),
              label: `${percent}%`,
            }))}
            onChange={(value) => appearance.onUiScale(Number(value))}
          />
        </Row>
        <Row
          id="show-excluded-files"
          label="Show excluded files"
          description="Show files and folders Git excludes, such as build output and dependencies, in the explorer."
        >
          <Toggle
            label="Show excluded files"
            on={appearance.showExcludedFiles}
            onChange={appearance.onShowExcludedFiles}
          />
        </Row>
      </Group>
    </>
  );
}

export function ChatBackgroundCard({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const src = chatBackgroundSrc(appearance.chatBackgroundPath);
  const hasImage = Boolean(appearance.chatBackgroundPath && src);
  const emptyVisibility = Math.round(
    appearance.chatBackgroundEmptyOpacity * 100,
  );
  const sessionVisibility = Math.round(
    appearance.chatBackgroundSessionOpacity * 100,
  );
  const busy = appearance.chatBackgroundBusy;

  return (
    <Group
      id="chat-background"
      title="Chat background"
      description="An image behind your chat panes. It stays on this device."
    >
      <div className="border-b border-content/5 p-4 last:border-b-0">
        <div className="overflow-hidden rounded-lg border border-content/10">
          {hasImage ? (
            <div
              className={`relative h-36 ${appearance.newThreadBackgroundEffect === "gradient-blur" ? "bg-background-base" : ""}`}
            >
              {appearance.newThreadBackgroundEffect === "gradient-blur" ? (
                <GradientBlurBackground
                  className="gradient-blur-preview absolute inset-0"
                  style={{ opacity: appearance.chatBackgroundEmptyOpacity }}
                />
              ) : (
                <div
                  aria-hidden
                  className="size-full bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: "var(--chat-background-image)",
                    opacity: appearance.chatBackgroundEmptyOpacity,
                  }}
                />
              )}
              <span className="pointer-events-none absolute bottom-2 left-2 text-[11px] text-content/40">
                Empty chat preview at {emptyVisibility}%
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void appearance.onChooseChatBackground()}
              disabled={busy}
              className="flex h-36 w-full flex-col items-center justify-center gap-2 text-content/40 hover:bg-content/5 hover:text-content/70 disabled:cursor-default disabled:opacity-40"
            >
              {busy ? (
                <Loader className="size-5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="size-5" aria-hidden />
              )}
              <span className="text-[12px]">Choose an image</span>
            </button>
          )}
        </div>
        {hasImage ? (
          <div className="mt-3 flex items-center justify-end gap-2">
            <SecondaryButton
              onClick={() => void appearance.onChooseChatBackground()}
              disabled={busy}
            >
              {busy ? (
                <Loader className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Change
            </SecondaryButton>
            <SecondaryButton
              onClick={() => void appearance.onClearChatBackground()}
              disabled={busy}
              danger
            >
              Remove
            </SecondaryButton>
          </div>
        ) : null}
        {appearance.chatBackgroundError ? (
          <p className="mt-2 text-[12px] text-red-400">
            {appearance.chatBackgroundError}
          </p>
        ) : null}
      </div>
      {hasImage ? (
        <>
          <Row
            label="Background effect"
            description={
              NEW_THREAD_BACKGROUND_EFFECT_DESCRIPTIONS[
                appearance.newThreadBackgroundEffect
              ]
            }
          >
            <Segmented
              label="Background effect"
              value={appearance.newThreadBackgroundEffect}
              options={NEW_THREAD_BACKGROUND_EFFECTS.map((effect) => ({
                value: effect,
                label: NEW_THREAD_BACKGROUND_EFFECT_LABELS[effect],
              }))}
              onChange={appearance.onNewThreadBackgroundEffect}
              optionIdPrefix="new-thread-background-effect"
            />
          </Row>
          <Row
            label="Show on"
            description="Empty sessions only, or every conversation."
          >
            <Segmented
              label="Show background on"
              value={appearance.chatBackgroundScope}
              options={[
                { value: "empty", label: "Empty only" },
                { value: "all", label: "All sessions" },
              ]}
              onChange={appearance.onChatBackgroundScope}
            />
          </Row>
          <Row
            label="Empty chat visibility"
            description="Background strength before a chat has messages."
          >
            <Slider
              label="Empty chat background visibility"
              value={emptyVisibility}
              display={`${emptyVisibility}%`}
              min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
              max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
              onChange={appearance.onChatBackgroundEmptyOpacity}
            />
          </Row>
          <Row
            label="Session visibility"
            description="Background strength once the conversation has messages."
          >
            <Slider
              label="Session background visibility"
              value={sessionVisibility}
              display={`${sessionVisibility}%`}
              min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
              max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
              onChange={appearance.onChatBackgroundSessionOpacity}
            />
          </Row>
          <Row
            label="Background blur"
            description="Blurs the image behind chat panes, including project images. Haze keeps its own blur."
          >
            <Slider
              label="Chat background blur"
              value={appearance.chatBackgroundBlur}
              display={`${appearance.chatBackgroundBlur}px`}
              min={CHAT_BACKGROUND_BLUR_MIN}
              max={CHAT_BACKGROUND_BLUR_MAX}
              onChange={appearance.onChatBackgroundBlur}
            />
          </Row>
        </>
      ) : null}
    </Group>
  );
}

export const ACCENT_COLOR_PRESETS = [
  "#4da3f5",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#10b981",
] as const;

export function AccentColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const colorIndex = value
    ? ACCENT_COLOR_PRESETS.indexOf(
        value as (typeof ACCENT_COLOR_PRESETS)[number],
      )
    : -1;
  const presetIndex =
    value == null || value.toLowerCase() === ACCENT_COLOR_DEFAULT.toLowerCase()
      ? 0
      : colorIndex >= 0
        ? colorIndex + 1
        : -1;

  return (
    <div ref={root} className="w-48">
      <ColorSwatchRow
        colors={[ACCENT_COLOR_DEFAULT, ...ACCENT_COLOR_PRESETS]}
        labels={["Default", "Blue", "Violet", "Pink", "Red", "Orange", "Green"]}
        colorIndex={presetIndex >= 0 ? presetIndex : undefined}
        customColor={presetIndex < 0 ? (value ?? undefined) : undefined}
        customPickerOpen={open}
        onPickIndex={(index) => {
          setOpen(false);
          onChange(
            index === 0
              ? ACCENT_COLOR_DEFAULT
              : (ACCENT_COLOR_PRESETS[index - 1] ?? ACCENT_COLOR_PRESETS[0]),
          );
        }}
        onToggleCustom={() => setOpen((current) => !current)}
      />
      {open ? (
        <Popover
          anchor={root}
          side="bottom"
          align="end"
          width={248}
          onDismiss={() => setOpen(false)}
          className="px-2 pb-2"
        >
          <ColorPickerPopover
            value={value ?? ACCENT_COLOR_PRESETS[0]}
            onChange={onChange}
          />
        </Popover>
      ) : null}
    </div>
  );
}
