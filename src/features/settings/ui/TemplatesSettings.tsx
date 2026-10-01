import { useState, useSyncExternalStore } from "react";
import { Plus, Trash2 } from "../../../shared/ui/icons";
import {
  CURSOR_PLACEHOLDER,
  loadPromptTemplates,
  MAX_TEMPLATE_BODY,
  MAX_TEMPLATES,
  savePromptTemplates,
  subscribePromptTemplates,
  TRIGGER_PREFIX,
  type PromptTemplate,
} from "../../sessions/model/promptTemplates";

const FIELD =
  "rounded-md border border-content/10 bg-transparent px-2 text-[12px] text-content outline-none placeholder:text-content/35 focus:border-content/25";

function sameTemplates(a: readonly PromptTemplate[], b: readonly PromptTemplate[]) {
  return (
    a.length === b.length &&
    a.every((row, index) => {
      const other = b[index];
      return (
        !!other &&
        row.id === other.id &&
        row.name === other.name &&
        row.body === other.body &&
        (row.trigger ?? "") === (other.trigger ?? "")
      );
    })
  );
}

/** Settings page for saved prompt snippets, inserted from the composer's slash picker or `;trigger`. */
export function TemplatesSettings() {
  const saved = useSyncExternalStore(
    subscribePromptTemplates,
    loadPromptTemplates,
    () => [],
  );
  const [rows, setRows] = useState<PromptTemplate[]>(() => [...saved]);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameTemplates(rows, saved);

  const update = (id: string, patch: Partial<PromptTemplate>) => {
    setError(null);
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const save = () => {
    try {
      savePromptTemplates(rows);
      setError(null);
      // Re-read so names and triggers show as they were stored.
      setRows([...loadPromptTemplates()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="pt-8">
      <div className="flex items-end gap-4 pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-content">
            Prompt templates
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-content/45">
            Pick one from the / menu in the composer, or type{" "}
            <code>{TRIGGER_PREFIX}trigger</code> and a space. Put{" "}
            <code>{CURSOR_PLACEHOLDER}</code> where the caret should land.
          </p>
        </div>
        <button
          type="button"
          disabled={rows.length >= MAX_TEMPLATES}
          onClick={() => {
            setError(null);
            setRows((current) => [
              ...current,
              { id: crypto.randomUUID(), name: "", body: "" },
            ]);
          }}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-content/10 px-2.5 text-[12px] text-content/80 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-40"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          Add template
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-content/10 bg-content/3">
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-content/45">
            No templates yet
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 border-b border-content/5 px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <input
                  value={row.name}
                  onChange={(event) =>
                    update(row.id, { name: event.target.value })
                  }
                  placeholder="Name"
                  aria-label="Template name"
                  spellCheck={false}
                  autoComplete="off"
                  className={`${FIELD} h-7 min-w-0 flex-1`}
                />
                <label className="flex h-7 w-36 shrink-0 items-center gap-1 rounded-md border border-content/10 px-2 text-[12px] text-content/45 focus-within:border-content/25">
                  {TRIGGER_PREFIX}
                  <input
                    value={row.trigger ?? ""}
                    onChange={(event) =>
                      update(row.id, { trigger: event.target.value })
                    }
                    placeholder="trigger (optional)"
                    aria-label="Template trigger"
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content/35"
                  />
                </label>
                <button
                  type="button"
                  title="Delete template"
                  aria-label="Delete template"
                  onClick={() => {
                    setError(null);
                    setRows((current) =>
                      current.filter((item) => item.id !== row.id),
                    );
                  }}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <textarea
                value={row.body}
                onChange={(event) =>
                  update(row.id, { body: event.target.value })
                }
                placeholder={`Text to insert, e.g. "Review ${CURSOR_PLACEHOLDER} for bugs"`}
                aria-label="Template text"
                rows={3}
                maxLength={MAX_TEMPLATE_BODY}
                spellCheck={false}
                className={`${FIELD} min-h-16 w-full resize-y py-1.5 font-mono leading-5`}
              />
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-3 pt-3">
        <button
          type="button"
          disabled={!dirty}
          onClick={save}
          className="primary-action h-7 rounded-md px-3 text-[12px] font-medium disabled:cursor-default disabled:opacity-40"
        >
          Save templates
        </button>
        {dirty && !error ? (
          <span className="text-[12px] text-content/45">Unsaved changes</span>
        ) : null}
        {error ? (
          <span role="alert" className="text-[12px] text-red-400">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}
