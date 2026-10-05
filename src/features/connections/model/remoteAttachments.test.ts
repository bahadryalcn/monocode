import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { uploadRemoteAttachments } from "./remoteAttachments";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

it("uploads local bytes before returning host attachment references", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  vi.mocked(invoke).mockImplementation(async (command, input) => {
    if (command === "read_file_base64")
      return Buffer.from("sample").toString("base64");
    if (command === "remote_request") {
      const { method, params } = input as {
        method: string;
        params: Record<string, unknown>;
      };
      calls.push({ method, params });
      return { offset: 6 };
    }
    throw new Error(`Unexpected invoke ${command}`);
  });
  const file = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "sample.txt",
    mimeType: "text/plain",
    kind: "file" as const,
    size: 6,
    path: "/laptop/sample.txt",
  };
  const refs = await uploadRemoteAttachments("machine", [file]);
  expect(refs).toEqual([
    {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      size: 6,
    },
  ]);
  expect(calls).toEqual([
    {
      method: "attachments.upload",
      params: {
        id: file.id,
        offset: 0,
        size: 6,
        data: Buffer.from("sample").toString("base64"),
      },
    },
  ]);
});

it("retries only the unacknowledged chunk after an interrupted transfer", async () => {
  const size = 600_000;
  const data = Buffer.alloc(size, 7).toString("base64");
  const offsets: number[] = [];
  let failed = false;
  vi.mocked(invoke).mockImplementation(async (_command, input) => {
    const { params } = input as { params: { offset: number; data: string } };
    offsets.push(params.offset);
    if (params.offset > 0 && !failed) { failed = true; throw new Error("Disconnected"); }
    return { offset: params.offset + Buffer.from(params.data, "base64").length };
  });
  const file = { id: "retry-image", name: "large", mimeType: "application/octet-stream", kind: "file" as const, size, data };
  await expect(uploadRemoteAttachments("retry-machine", [file])).rejects.toThrow("Disconnected");
  await uploadRemoteAttachments("retry-machine", [file]);
  expect(offsets).toEqual([0, 524286, 524286]);
});

it("keeps two uploads in flight while preserving the attachment order", async () => {
  let active = 0;
  let maximum = 0;
  vi.mocked(invoke).mockImplementation(async (_command, input) => {
    const { params } = input as { params: { offset: number; data: string } };
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
    return { offset: params.offset + Buffer.from(params.data, "base64").length };
  });
  const files = Array.from({ length: 4 }, (_, n) => ({ id: `parallel-${n}`, name: String(n), mimeType: "text/plain", kind: "file" as const, size: 3, data: "YWJj" }));
  const refs = await uploadRemoteAttachments("parallel", files);
  expect(maximum).toBe(2);
  expect(refs.map((file) => file.id)).toEqual(files.map((file) => file.id));
});
