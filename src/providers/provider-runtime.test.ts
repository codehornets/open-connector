import type { TransitFileRead, TransitFileWriter } from "../core/types.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError, uploadProviderUrlToTransitFile } from "./provider-runtime.ts";

describe("provider runtime file helpers", () => {
  it("bounds provider URL downloads before creating transit files", async () => {
    const transitFiles = new MemoryTransitFiles(4);

    await expect(
      uploadProviderUrlToTransitFile(
        {
          url: "https://provider.example/report.txt",
          name: "report.txt",
          source: "example",
        },
        {
          fetcher: async () => new Response("12345"),
          transitFiles,
        },
      ),
    ).rejects.toMatchObject({
      status: 413,
      message: "report.txt exceeds 4 bytes",
    });
    expect(transitFiles.createdFiles).toHaveLength(0);
  });

  it("stores bounded provider URL downloads", async () => {
    const transitFiles = new MemoryTransitFiles(32);

    const upload = await uploadProviderUrlToTransitFile(
      {
        url: "https://provider.example/report.txt",
        name: "report.txt",
        source: "example",
      },
      {
        fetcher: async () => new Response("hello", { headers: { "content-type": "text/plain" } }),
        transitFiles,
      },
    );

    expect(upload).toMatchObject({
      fileId: "file-1",
      name: "report.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
    });
    await expect(transitFiles.createdFiles[0]?.text()).resolves.toBe("hello");
  });
});

class MemoryTransitFiles implements TransitFileWriter {
  readonly createdFiles: File[] = [];
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  async create(file: File): Promise<{
    fileId: string;
    downloadUrl: string;
    sizeBytes: number;
    name: string;
    mimeType: string;
  }> {
    if (file.size > this.maxBytes) {
      throw new ProviderRequestError(413, "file too large");
    }
    this.createdFiles.push(file);
    return {
      fileId: `file-${this.createdFiles.length}`,
      downloadUrl: `http://localhost/files/${this.createdFiles.length}`,
      sizeBytes: file.size,
      name: file.name,
      mimeType: file.type,
    };
  }

  read(_fileId: string): Promise<TransitFileRead> {
    throw new Error("not implemented");
  }

  async delete(_fileId: string): Promise<boolean> {
    return false;
  }
}
