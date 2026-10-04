import { expect, it, vi } from "vitest";
import {
  PREVIEW_BUDGET_BYTES,
  withRemoteAttachmentPreviews,
} from "./remoteAttachmentPreviews";
import type { HostSession } from "./protocol";

const snapshot = (): HostSession => ({
  projectId: "project",
  revision: 1,
  updatedAt: 0,
  status: "idle",
  session: {
    id: "session",
    cwd: "/repo",
    harness: "codex",
    model: "codex:test",
    runtimeMode: "supervised",
    title: "Image",
    blocks: [
      {
        id: "turn",
        role: "user",
        text: "Look",
        attachments: [
          {
            id: "image",
            name: "shot.png",
            mimeType: "image/png",
            kind: "image",
            size: 5,
            path: "/host/image",
          },
        ],
      },
    ],
  },
});

it("downloads generated images through the session chunk reader and reuses them", async () => {
  const value = snapshot();
  value.session.blocks = [
    {
      id: "generated",
      role: "image",
      text: "",
      image: {
        path: "/host/attachments/uuid",
        name: "result.png",
        mimeType: "image/png",
        size: 3,
      },
    },
  ];
  const read = vi.fn(async () => ({ offset: 3, size: 3, data: btoa("png") }));
  const first = await withRemoteAttachmentPreviews(
    "generated-machine",
    value,
    undefined,
    read,
  );
  expect(read).toHaveBeenCalledWith({
    sessionId: "session",
    id: "generated",
    offset: 0,
  });
  expect(first.session.blocks[0].image?.data).toBe(btoa("png"));
  const next = await withRemoteAttachmentPreviews(
    "generated-machine",
    value,
    first,
    read,
  );
  expect(next.session.blocks[0].image?.data).toBe(btoa("png"));
  expect(read).toHaveBeenCalledTimes(1);
});

it("reopens image previews from chunks and reuses bytes on subsequent syncs", async () => {
  const read = vi.fn(async ({ offset }: { offset: number }) =>
    offset === 0
      ? { offset: 3, size: 5, data: btoa("abc") }
      : { offset: 5, size: 5, data: btoa("de") },
  );
  const first = await withRemoteAttachmentPreviews(
    "machine",
    snapshot(),
    undefined,
    read,
  );
  expect(first.session.blocks[0].attachments?.[0].data).toBe(btoa("abcde"));
  expect(read).toHaveBeenCalledTimes(2);
  const next = await withRemoteAttachmentPreviews(
    "machine",
    snapshot(),
    first,
    read,
  );
  expect(next.session.blocks[0].attachments?.[0].data).toBe(btoa("abcde"));
  expect(read).toHaveBeenCalledTimes(2);
});

it("keeps the transcript available when an image is missing", async () => {
  const value = snapshot();
  const read = vi.fn(async () => {
    throw new Error("Image no longer available");
  });
  const result = await withRemoteAttachmentPreviews(
    "machine",
    value,
    undefined,
    read,
  );
  expect(result.session.blocks[0].text).toBe(value.session.blocks[0].text);
  expect(result.session.blocks[0].attachments?.[0].loadPreview).toBeTypeOf(
    "function",
  );
});

it("backs off a missing image across unchanged syncs", async () => {
  vi.useFakeTimers();
  try {
    const read = vi.fn(async () => {
      throw new Error("missing");
    });
    let known: HostSession | undefined;
    for (let i = 0; i < 5; i++)
      known = await withRemoteAttachmentPreviews(
        "backoff-machine",
        snapshot(),
        known,
        read,
      );
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_001);
    await withRemoteAttachmentPreviews(
      "backoff-machine",
      snapshot(),
      known,
      read,
    );
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("limits concurrent reads and favors recent previews within the byte budget", async () => {
  const value = snapshot();
  const template = value.session.blocks[0].attachments![0];
  value.session.blocks[0].attachments = Array.from({ length: 6 }, (_, i) => ({
    ...template,
    id: `image${i}`,
  }));
  let active = 0;
  let peak = 0;
  const read = vi.fn(async () => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    active--;
    return { offset: 5, size: 5, data: btoa("abcde") };
  });
  await withRemoteAttachmentPreviews("bounded-machine", value, undefined, read);
  expect(peak).toBe(2);
  const oldData = "already downloaded";
  value.session.blocks[0].attachments = Array.from({ length: 3 }, (_, i) => ({
    ...template,
    id: `large${i}`,
    size: PREVIEW_BUDGET_BYTES / 2,
    data: oldData,
  }));
  const bounded = await withRemoteAttachmentPreviews(
    "bounded-machine",
    value,
    undefined,
    read,
  );
  expect(
    bounded.session.blocks[0].attachments!.map((file) => file.data),
  ).toEqual([undefined, oldData, oldData]);
});
