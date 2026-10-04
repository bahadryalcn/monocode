import { Check, Search, Star } from "../../../shared/ui/icons";
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { type AgentModel, type ModelPickerTab } from "../model/models";

import { harnessUnavailableHint } from "../../../integrations/harness/core/availability";
import { useModelSource } from "./modelSource";
import { HARNESSES, HARNESS_TITLE, type HarnessId } from "../model/session";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { LAYER } from "../../../shared/lib/layers";
import { HarnessIcon } from "./HarnessIcon";
import { Popover } from "../../../shared/ui/Popover";

import "./ModelPicker.css";

import { modelGroups } from "../model/modelPickerData";
const MODEL_MENU_WIDTH = 310;
const SUBMENU_OVERLAP = -4;
const PROVIDER_TAB_SIZE = 32;
const PROVIDER_TAB_GAP = 4;
const PROVIDER_RAIL_PADDING = 12;
const MODEL_MENU_HEIGHT =
  (HARNESSES.length + 1) * PROVIDER_TAB_SIZE +
  HARNESSES.length * PROVIDER_TAB_GAP +
  PROVIDER_RAIL_PADDING;
const MODEL_MENU_FRAME_HEIGHT = MODEL_MENU_HEIGHT + 2;

export function ModelFlyout({
  anchor,
  side = "right",
  autoFocusSearch = false,
  onDismiss,
  harnesses,
  tab,
  models,
  currentId,
  active,
  query,
  favorites,
  searchRef,
  onQuery,
  onSelectTab,
  onActive,
  onPick,
  onToggleFavorite,
}: {
  anchor: HTMLButtonElement | { current: HTMLButtonElement | null };
  side?: "right" | "top";
  autoFocusSearch?: boolean;
  onDismiss?: (reason: "outside" | "escape") => void;
  harnesses: HarnessId[];
  tab: ModelPickerTab;
  models: AgentModel[];
  currentId: string;
  active: number;
  query: string;
  favorites: string[];
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onSelectTab: (tab: ModelPickerTab) => void;
  onActive: (index: number) => void;
  onPick: (model: AgentModel) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const source = useModelSource();
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const activeRef = useRef<HTMLButtonElement>(null);
  const groups = modelGroups(tab, models);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      onActive(Math.min(models.length - 1, active + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      onActive(Math.max(0, active - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const item = models[active];
      if (item) onPick(item);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.stopPropagation();
    }
  };

  return (
    <Popover
      anchor={anchor}
      side={side}
      gap={side === "right" ? SUBMENU_OVERLAP : undefined}
      width={MODEL_MENU_WIDTH}
      minHeight={MODEL_MENU_FRAME_HEIGHT}
      maxHeight={MODEL_MENU_FRAME_HEIGHT}
      layer={LAYER.submenu}
      role="dialog"
      aria-label="Models"
      onDismiss={onDismiss}
      onKeyDown={(event) => {
        // Keyboard nav once focus leaves the search field (which stops its
        // own keys). Scoped to the list so provider tabs keep their buttons.
        if (
          !(event.target instanceof Element) ||
          !event.target.closest('[role="listbox"]')
        ) {
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          onActive(
            Math.min(models.length - 1, Math.max(0, active + direction)),
          );
          return;
        }
        if (event.key !== "Enter") return;
        // Favorite toggles keep native activation; model rows activate the
        // highlighted option so Enter never fires on a stale focused row.
        if (
          event.target instanceof HTMLButtonElement &&
          event.target.getAttribute("role") !== "option"
        ) {
          return;
        }
        event.preventDefault();
        const item = models[active];
        if (item) onPick(item);
      }}
      data-model-picker
      style={{
        height: MODEL_MENU_HEIGHT,
        minHeight: MODEL_MENU_HEIGHT,
        maxHeight: MODEL_MENU_HEIGHT,
      }}
      className="flex min-h-0 overflow-hidden font-sans"
    >
      <nav
        role="tablist"
        aria-label="Providers"
        aria-orientation="vertical"
        className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-stroke p-1.5"
      >
        <ProviderTabButton
          title="Favorites"
          selected={tab === "favorites"}
          onSelect={() => onSelectTab("favorites")}
        >
          <Star
            className="size-4"
            strokeWidth={1.75}
            fill={tab === "favorites" ? "currentColor" : "none"}
          />
        </ProviderTabButton>
        {harnesses.map((harness) => (
          <ProviderTabButton
            key={harness}
            title={HARNESS_TITLE[harness]}
            selected={tab === harness}
            onSelect={() => onSelectTab(harness)}
          >
            <HarnessIcon harness={harness} className="size-4" />
          </ProviderTabButton>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <label className="flex shrink-0 items-center gap-2 border-b border-stroke px-3 py-2.5 text-content/50">
          <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
          <input
            ref={searchRef}
            type="text"
            value={query}
            placeholder="Search models"
            aria-label="Search models"
            autoFocus={autoFocusSearch}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-content outline-none placeholder:text-content/40"
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={onSearchKey}
          />
        </label>

        <div
          ref={lockOverscroll}
          role="listbox"
          aria-label="Models"
          className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1"
        >
          {models.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-content/50">
              {tab === "favorites" && !query.trim()
                ? "No favorite models"
                : tab !== "favorites" && !source.available(tab)
                  ? harnessUnavailableHint(tab)
                  : tab === "codex" && !query.trim()
                    ? "Loading Codex models…"
                    : "No matching models"}
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                role={group.name ? "group" : undefined}
                aria-label={group.name}
              >
                {group.name ? (
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-content/40">
                    {group.name}
                  </div>
                ) : null}
                {group.models.map(({ item, index }) => {
                  const selected = item.id === currentId;
                  const highlighted = index === active;
                  const favorited = favorites.includes(item.id);
                  const disabled = !source.available(item.harness);
                  // Favorites mix harnesses, so every row names its source.
                  // Provider first (OpenCode Go vs OpenCode), else harness.
                  const provenance =
                    item.provider?.name ?? HARNESS_TITLE[item.harness];
                  return (
                    <div
                      key={item.id}
                      className={`group flex h-8 items-center rounded-lg px-1 ${
                        disabled
                          ? "text-content/30"
                          : highlighted
                            ? "bg-selection text-content"
                            : "text-content hover:bg-content/5"
                      }`}
                      onMouseEnter={() => onActive(index)}
                    >
                      <button
                        ref={highlighted ? activeRef : undefined}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={`${item.name}, ${provenance}`}
                        disabled={disabled}
                        title={
                          disabled
                            ? harnessUnavailableHint(item.harness)
                            : undefined
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onPick(item)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-left text-[13px] disabled:cursor-not-allowed"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {item.name}
                        </span>
                      </button>
                      {tab === "favorites" ? (
                        <span className="max-w-24 shrink-0 truncate text-[10px] text-content/40">
                          {provenance}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        title={
                          favorited
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        aria-label={
                          favorited
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFavorite(item.id);
                        }}
                        className={`grid size-6 shrink-0 place-items-center rounded-md transition-opacity ${
                          favorited
                            ? "text-content/60"
                            : "text-content/35 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                      >
                        <Star
                          className="size-3.5"
                          strokeWidth={1.75}
                          fill={favorited ? "currentColor" : "none"}
                        />
                      </button>
                      {selected ? (
                        <span
                          aria-hidden="true"
                          className="grid size-6 shrink-0 place-items-center"
                        >
                          <Check
                            className="size-3.5 text-content/55"
                            strokeWidth={2}
                          />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
}

function ProviderTabButton({
  title,
  selected,
  onSelect,
  children,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      title={title}
      aria-label={title}
      aria-selected={selected}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={selected ? undefined : onSelect}
      onClick={onSelect}
      className={`grid size-8 shrink-0 place-items-center rounded-md ${
        selected
          ? "bg-selection-strong text-content"
          : "text-content/45 hover:bg-content/8 hover:text-content"
      }`}
    >
      <span className="shrink-0">{children}</span>
    </button>
  );
}
