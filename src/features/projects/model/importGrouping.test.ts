import { describe, expect, it } from "vitest";
import { pathKey } from "../../../shared/lib/paths";
import { proposeProjectGroups } from "./importGrouping";

const none = new Set<string>();

describe("proposeProjectGroups", () => {
  it("groups projects by the folder they sit in", () => {
    const groups = proposeProjectGroups({
      grouped: none,
      paths: [
        "G:/Projects/Firisbe/jira",
        "G:/Projects/Firisbe/db-ai",
        "G:/Projects/my_projects/monocode",
        "G:/Projects/my_projects/burak",
        "G:/wallet/mobile",
        "G:/wallet/tms-app",
      ],
    });
    expect(groups.map((group) => [group.name, group.paths])).toEqual([
      ["Firisbe", ["G:/Projects/Firisbe/db-ai", "G:/Projects/Firisbe/jira"]],
      ["my_projects", ["G:/Projects/my_projects/burak", "G:/Projects/my_projects/monocode"]],
      ["wallet", ["G:/wallet/mobile", "G:/wallet/tms-app"]],
    ]);
  });

  it("never makes a group for a lone project", () => {
    expect(
      proposeProjectGroups({
        grouped: none,
        paths: ["G:/Projects/solo/app", "G:/Projects/other/app"],
      }),
    ).toEqual([]);
  });

  it("lets a lone project join a group the user already has", () => {
    const groups = proposeProjectGroups({
      grouped: none,
      existingGroupNames: ["firisbe"],
      paths: ["G:/Projects/Firisbe/jira"],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Firisbe");
  });

  it("leaves projects the user already grouped alone, and does not count them", () => {
    const groups = proposeProjectGroups({
      grouped: new Set([pathKey("G:/Projects/Firisbe/jira")]),
      paths: ["G:/Projects/Firisbe/jira", "G:/Projects/Firisbe/db-ai"],
    });
    expect(groups).toEqual([]);
  });

  it("matches folders case-insensitively and counts a project once", () => {
    const groups = proposeProjectGroups({
      grouped: none,
      paths: [
        "g:/Projects/my_projects/burak",
        "G:/Projects/my_projects/monocode",
        "G:/projects/MY_PROJECTS/burak",
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].paths).toEqual([
      "g:/Projects/my_projects/burak",
      "G:/Projects/my_projects/monocode",
    ]);
  });

  it("ignores drive roots and the home folder", () => {
    expect(
      proposeProjectGroups({
        grouped: none,
        paths: ["G:/a", "G:/b", "C:/Users/kraba/x", "C:/Users/kraba/y"],
      }),
    ).toEqual([]);
  });

  it("keeps same-named folders in different places apart", () => {
    const groups = proposeProjectGroups({
      grouped: none,
      paths: [
        "G:/one/src/a",
        "G:/one/src/b",
        "G:/two/src/c",
        "G:/two/src/d",
      ],
    });
    expect(groups.map((group) => group.name)).toEqual([
      "src (G:/one)",
      "src (G:/two)",
    ]);
  });
});
