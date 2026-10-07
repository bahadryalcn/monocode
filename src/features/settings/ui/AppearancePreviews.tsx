import type { CSSProperties } from "react";
import {
  Group,
  Row,
  Select,
  Slider,
  Toggle,
  Segmented,
} from "./settingsControls";
import type { AppearanceSettings } from "./useAppearanceSettings";
import { CODE_FONTS, INTERFACE_FONTS } from "../model/appearancePreferences";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import { useColorScheme } from "../../../shared/hooks/useColorScheme";
import "./AppearancePreviews.css";

const presets = [
  {
    name: "imc",
    note: "Cool silver, quiet surfaces",
    hue: 216,
    saturation: 24,
    lightness: 4,
    accent: "#A3ACB8",
  },
  {
    name: "Olive",
    note: "A softer green workspace",
    hue: 150,
    saturation: 22,
    lightness: 7,
    accent: "#69b68e",
  },
  {
    name: "Tide",
    note: "Clear blue, a little air",
    hue: 205,
    saturation: 30,
    lightness: 7,
    accent: "#65b4db",
  },
  {
    name: "Kiln",
    note: "Warm clay, mellow light",
    hue: 25,
    saturation: 24,
    lightness: 7,
    accent: "#dba276",
  },
  {
    name: "Dusk",
    note: "Muted violet, evening calm",
    hue: 275,
    saturation: 24,
    lightness: 7,
    accent: "#b297d4",
  },
  {
    name: "Ink",
    note: "A study in neutral tones",
    hue: 216,
    saturation: 0,
    lightness: 5,
    accent: "#b8b8b8",
  },
];

export function AppearanceStudio({
  appearance: a,
}: {
  appearance: AppearanceSettings;
}) {
  const scheme = useColorScheme();
  const light = scheme === "light";
  const selected = presets.find(
    (p) =>
      p.hue === a.themeHue &&
      p.saturation === a.themeSaturation &&
      p.lightness === a.themeDarkLightness &&
      p.accent.toLowerCase() === a.accentColor?.toLowerCase(),
  );
  const workspaceStyle = {
    "--studio-base": `hsl(${a.themeHue} ${a.themeSaturation}% ${light ? 97 : a.themeDarkLightness}%)`,
    "--studio-raised": `hsl(${a.themeHue} ${a.themeSaturation}% ${light ? 92 : a.themeDarkLightness + 7}%)`,
    "--studio-ink": `hsl(${a.themeHue} ${a.themeSaturation}% ${light ? 16 : 91}%)`,
    "--studio-line": `color-mix(in srgb, var(--studio-ink) ${(7 * a.preferences.contrast) / 100}%, transparent)`,
    "--studio-secondary": `color-mix(in srgb, var(--studio-ink) ${Math.min(85, (55 * a.preferences.contrast) / 100)}%, transparent)`,
    "--studio-chat-span":
      a.preferences.chatWidth === "full"
        ? "100%"
        : a.preferences.chatWidth === "wide"
          ? "94%"
          : "80%",
    "--studio-sidebar-opacity": light ? 1 : a.opacity,
    "--studio-body-opacity": light || !a.bodyGlass ? 1 : a.mainOpacity,
  } as CSSProperties;
  return (
    <div className="appearance-studio">
      <div className="appearance-studio-heading">
        <div>
          <span className="appearance-eyebrow">THE WORKSPACE ATELIER</span>
          <h2>A place to think.</h2>
          <p>Shape the light, the ink and the space around your work.</p>
        </div>
        <div
          id="setting-theme"
          data-setting-id="theme"
          className="appearance-scheme-control"
        >
          <span>Color mode</span>
          <Segmented
            label="Color scheme"
            value={a.themePreference}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={a.onThemePreference}
          />
        </div>
      </div>
      <div className="appearance-studio-body">
        <div
          className="appearance-desk"
          style={workspaceStyle}
          role="region"
          aria-label="Live workspace preview"
        >
          <div className="appearance-desk-top">
            <span>
              <img src={PRODUCT_IDENTITY.logoSrc} alt="" />
              imc
            </span>
            <span className="appearance-desk-tab">studio / welcome</span>
            <span className="appearance-live-label">
              <i />
              Live preview
            </span>
          </div>
          <div className="appearance-desk-content">
            <aside
              className="appearance-desk-sidebar"
              aria-label="Sidebar preview"
            >
              <span className="appearance-desk-caption">YOUR CORNER</span>
              <strong>
                <span>▱</span> Studio
              </strong>
              <div className="appearance-desk-current">Welcome home</div>
              <div>Small ideas</div>
              <div>Next steps</div>
              <span className="appearance-desk-caption appearance-desk-later">
                RECENT FILES
              </span>
              <div className="appearance-desk-file">↳ welcome.ts</div>
              <div className="appearance-desk-file">↳ notes.md</div>
              <div className="appearance-desk-sidebar-bottom">
                All the room you need.
              </div>
            </aside>
            <div className="appearance-desk-chat">
              <div className="appearance-desk-conversation">
                <div className="appearance-desk-user">
                  Let’s make something good together.
                </div>
                <div className="appearance-desk-response">
                  <span className="appearance-desk-caption">İMECE</span>
                  <h3>Good work starts with a little clarity.</h3>
                  <p>
                    Your ideas, a quiet workspace, and room for the next step.
                  </p>
                </div>
                <div
                  className="appearance-desk-code"
                  aria-label="Code and diff preview"
                >
                  <div>
                    <span>▧ welcome.ts</span>
                    <span className="appearance-desk-caption">−1 +1</span>
                  </div>
                  <pre>
                    <code>
                      <span className="appearance-code-keyword">
                        export function
                      </span>
                      {" welcome(name: string) {\n"}
                      <span className="appearance-deletion">
                        {'−  return "Hello " + name;\n'}
                      </span>
                      <span className="appearance-addition">
                        {
                          " + return `Merhaba ${name}, let’s build something thoughtful together.`;\n"
                        }
                      </span>
                      {"}"}
                    </code>
                  </pre>
                </div>
                <div className="appearance-desk-terminal">
                  <span>✓</span> Workspace ready{" "}
                  <span className="appearance-desk-terminal-cursor">▎</span>
                </div>
                <div className="appearance-desk-composer">
                  <span>What shall we work on?</span>
                  <span>↗</span>
                </div>
              </div>
            </div>
          </div>
          <div className="appearance-desk-footer">
            <span>
              {selected?.name ?? "Custom palette"} /{" "}
              {light ? "daylight" : "after hours"}
            </span>
            <span>
              {a.preferences.codeSize}px · {a.preferences.chatWidth}
            </span>
          </div>
        </div>
        <div className="appearance-material-library">
          <div className="appearance-library-heading">
            <h3>Choose your materials</h3>
            <p>Surface · ink · accent</p>
          </div>
          <div role="group" aria-label="Theme palettes">
            {presets.map((p) => (
              <button
                type="button"
                key={p.name}
                className="appearance-palette"
                aria-pressed={selected?.name === p.name}
                onClick={() => {
                  a.onTint(p.hue, p.saturation);
                  a.onDarkLightness(p.lightness);
                  a.onAccentColor(p.accent);
                }}
                style={
                  {
                    "--material-base": `hsl(${p.hue} ${p.saturation}% ${light ? 94 : p.lightness + 5}%)`,
                    "--material-ink": `hsl(${p.hue} ${p.saturation}% ${light ? 24 : 82}%)`,
                    "--material-accent": p.accent,
                  } as CSSProperties
                }
              >
                <span className="appearance-material-sample" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="appearance-material-name">
                  <strong>{p.name}</strong>
                  <small>{p.note}</small>
                </span>
                <span className="appearance-material-check" aria-hidden="true">
                  {selected?.name === p.name ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
          <p className="appearance-library-note">
            {selected
              ? `${selected.name} is selected. One palette, in daylight or after hours.`
              : "Your custom colors are active. Adjust them in Advanced."}
          </p>
        </div>
      </div>
      <div className="appearance-studio-caption">
        <span>Make it yours.</span>
        <p>
          This is an example workspace. Your choices apply throughout the app
          and are saved automatically.
        </p>
      </div>
    </div>
  );
}

export function AppearanceInterface({
  appearance: a,
}: {
  appearance: AppearanceSettings;
}) {
  const p = a.preferences;
  return (
    <Group
      title="Reading & space"
      description="Give your conversations room to breathe."
    >
      <Row
        id="interface-contrast"
        label="Contrast"
        description="Make structural borders and secondary text softer or stronger."
      >
        <Slider
          label="Contrast"
          value={p.contrast}
          display={`${p.contrast}%`}
          min={75}
          max={150}
          onChange={(contrast) => a.onPreferences({ ...p, contrast })}
        />
      </Row>
      <Row
        id="diff-colors"
        label="Diff colors"
        description="Choose how added (+) and removed (−) lines are highlighted."
      >
        <Select
          label="Diff colors"
          value={a.diffPalette}
          options={[
            { value: "default", label: "Red & green" },
            { value: "colorblind", label: "Blue & orange" },
            { value: "high-contrast", label: "Blue & orange · stronger" },
          ]}
          onChange={(value) =>
            a.onDiffPalette(
              value === "colorblind" || value === "high-contrast"
                ? value
                : "default",
            )
          }
        />
      </Row>
      <Row
        id="chat-width"
        label="Chat width"
        description="Limit message width on large screens. Full width uses all available space."
      >
        <Select
          label="Chat width"
          value={p.chatWidth}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full width" },
          ]}
          onChange={(value) =>
            a.onPreferences({
              ...p,
              chatWidth:
                value === "wide" || value === "full" ? value : "comfortable",
            })
          }
        />
      </Row>
    </Group>
  );
}

export function AppearanceTypography({
  appearance: a,
}: {
  appearance: AppearanceSettings;
}) {
  const p = a.preferences;
  const fontOptions = (fonts: readonly string[]) =>
    fonts.map((value) => ({
      value,
      label: value === "System" ? "System default" : value,
    }));
  return (
    <Group
      title="Letterforms"
      description="Try your fonts in the workspace above. Unavailable fonts fall back to your device’s default."
    >
      <Row
        id="interface-font"
        label="Interface font"
        description="Navigation, messages, buttons and settings."
      >
        <Select
          label="Interface font"
          value={p.interfaceFont}
          options={fontOptions(INTERFACE_FONTS)}
          onChange={(interfaceFont) => a.onPreferences({ ...p, interfaceFont })}
        />
      </Row>
      <Row
        id="monospace-font"
        label="Monospace font"
        description="Code blocks, file editors, diffs and the terminal."
      >
        <Select
          label="Monospace font"
          value={p.codeFont}
          options={fontOptions(CODE_FONTS)}
          onChange={(codeFont) => a.onPreferences({ ...p, codeFont })}
        />
        <Select
          label="Code font size"
          value={String(p.codeSize)}
          options={[11, 12, 13, 14, 15, 16, 17, 18].map((value) => ({
            value: String(value),
            label: `${value} px`,
          }))}
          onChange={(value) =>
            a.onPreferences({ ...p, codeSize: Number(value) })
          }
        />
      </Row>
      <Row
        id="code-word-wrap"
        label="Word wrap"
        description="Wrap long lines in chat code blocks. File editors keep their own wrap control."
      >
        <Toggle
          label="Word wrap"
          on={p.wordWrap}
          onChange={(wordWrap) => a.onPreferences({ ...p, wordWrap })}
        />
      </Row>
    </Group>
  );
}
