// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { pathKey } from "../../../shared/lib/paths";
import {
  assignProjectsToNamedGroup,
  createProjectGroup,
  loadProjectGroupAssignments,
  loadProjectGroups,
  nextProjectGroupName,
  saveProjectGroupAssignments,
  saveProjectGroups,
  setProjectGroupAssignment,
} from "./projectGroups";

beforeEach(() => localStorage.clear());

describe("project groups", () => {
  it("persists ordered appearance and collapsed state", () => {
    expect(
      saveProjectGroups([
        {
          id: "clients",
          name: "Clients",
          collapsed: true,
          customColor: "#AABBCC",
          mascot: "ghost",
        },
        {
          id: "personal",
          name: "Personal",
          collapsed: false,
          colorIndex: 4,
        },
      ]),
    ).toBe(true);

    expect(loadProjectGroups()).toEqual([
      {
        id: "clients",
        name: "Clients",
        collapsed: true,
        customColor: "#aabbcc",
        mascot: "ghost",
      },
      {
        id: "personal",
        name: "Personal",
        collapsed: false,
        colorIndex: 4,
      },
    ]);
  });

  it("keeps assignments only for groups that still exist", () => {
    saveProjectGroups([{ id: "clients", name: "Clients", collapsed: false }]);
    saveProjectGroupAssignments({
      [pathKey("/work/client")]: "clients",
      [pathKey("/work/stale")]: "missing",
    });

    expect(loadProjectGroupAssignments()).toEqual({
      [pathKey("/work/client")]: "clients",
    });
    expect(setProjectGroupAssignment("/work/client", null)).toEqual({});
  });

  it("creates stable unique default names", () => {
    const groups = [
      { id: "one", name: "New group", collapsed: false },
      { id: "two", name: "NEW GROUP 2", collapsed: false },
    ];
    expect(nextProjectGroupName(groups)).toBe("New group 3");
    expect(createProjectGroup(groups)).toMatchObject({
      name: "New group 3",
      collapsed: false,
    });
  });

  it("creates a named group and assigns projects to it", () => {
    const group = assignProjectsToNamedGroup(" Acme ", ["/work/web", "/work/api"]);

    expect(group).toMatchObject({ name: "Acme", collapsed: false });
    expect(loadProjectGroups()).toEqual([group]);
    expect(loadProjectGroupAssignments()).toEqual({
      [pathKey("/work/web")]: group?.id,
      [pathKey("/work/api")]: group?.id,
    });
  });

  it("reuses a group with the same name and moves projects into it", () => {
    saveProjectGroups([
      { id: "acme", name: "Acme", collapsed: true },
      { id: "other", name: "Other", collapsed: false },
    ]);
    saveProjectGroupAssignments({ [pathKey("/work/web")]: "other" });

    expect(assignProjectsToNamedGroup("ACME", ["/work/web"])?.id).toBe("acme");
    expect(loadProjectGroups()).toHaveLength(2);
    expect(loadProjectGroupAssignments()).toEqual({
      [pathKey("/work/web")]: "acme",
    });
  });

  it("does nothing without a name or projects", () => {
    expect(assignProjectsToNamedGroup("  ", ["/work/web"])).toBeNull();
    expect(assignProjectsToNamedGroup("Acme", [])).toBeNull();
    expect(loadProjectGroups()).toEqual([]);
  });
});
