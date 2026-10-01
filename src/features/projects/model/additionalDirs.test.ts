// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  additionalDirCandidates,
  loadAdditionalDirs,
  rebaseAdditionalDirs,
  removeAdditionalDirs,
  saveAdditionalDirs,
} from "./additionalDirs";
import { saveProjectGroupAssignments, saveProjectGroups } from "./projectGroups";
import { pathKey } from "../../../shared/lib/paths";
import { rememberProject } from "./recents";

beforeEach(() => localStorage.clear());

describe("additional project folders", () => {
  it("is empty by default", () => {
    expect(loadAdditionalDirs("/work/web")).toEqual([]);
  });

  it("stores folders per project without duplicates or the project itself", () => {
    saveAdditionalDirs("/work/web", ["/work/api", "/work/web", "/work/api/", "/work/ui"]);

    expect(loadAdditionalDirs("/work/web")).toEqual(["/work/api", "/work/ui"]);
    expect(loadAdditionalDirs("/work/api")).toEqual([]);
  });

  it("clears and rebases", () => {
    saveAdditionalDirs("/work/web", ["/work/api"]);
    rebaseAdditionalDirs("/work/web", "/work/site");
    expect(loadAdditionalDirs("/work/web")).toEqual([]);
    expect(loadAdditionalDirs("/work/site")).toEqual(["/work/api"]);

    removeAdditionalDirs("/work/site");
    expect(loadAdditionalDirs("/work/site")).toEqual([]);
  });

  it("offers the other projects of the same group", () => {
    for (const path of ["/work/web", "/work/api", "/work/other", "/work/loose"]) {
      rememberProject(path);
    }
    saveProjectGroups([
      { id: "acme", name: "Acme", collapsed: false },
      { id: "misc", name: "Misc", collapsed: false },
    ]);
    saveProjectGroupAssignments({
      [pathKey("/work/web")]: "acme",
      [pathKey("/work/api")]: "acme",
      [pathKey("/work/other")]: "misc",
    });

    expect(additionalDirCandidates("/work/web")).toEqual(["/work/api"]);
    expect(additionalDirCandidates("/work/loose")).toEqual([]);
  });
});
