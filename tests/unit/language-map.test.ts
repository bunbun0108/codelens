import { describe, it, expect } from "vitest";
import { getLanguageFromPath } from "../../src/lib/language-map";

describe("getLanguageFromPath", () => {
  it("maps common code extensions correctly", () => {
    expect(getLanguageFromPath("src/index.ts")).toBe("typescript");
    expect(getLanguageFromPath("src/components/App.tsx")).toBe("tsx");
    expect(getLanguageFromPath("server/main.py")).toBe("python");
    expect(getLanguageFromPath("lib/core.rs")).toBe("rust");
    expect(getLanguageFromPath("main.go")).toBe("go");
    expect(getLanguageFromPath("styles.css")).toBe("css");
    expect(getLanguageFromPath("schema.prisma")).toBe("prisma");
    expect(getLanguageFromPath("config.yaml")).toBe("yaml");
    expect(getLanguageFromPath("script.sh")).toBe("bash");
  });

  it("maps special filenames correctly", () => {
    expect(getLanguageFromPath("Dockerfile")).toBe("dockerfile");
    expect(getLanguageFromPath("dockerfile")).toBe("dockerfile");
    expect(getLanguageFromPath("Dockerfile.dev")).toBe("dockerfile");
    expect(getLanguageFromPath("Makefile")).toBe("makefile");
  });

  it("returns null for unknown extensions or files without extension", () => {
    expect(getLanguageFromPath("LICENSE")).toBeNull();
    expect(getLanguageFromPath("data.xyz")).toBeNull();
    expect(getLanguageFromPath(".gitignore")).toBeNull();
    expect(getLanguageFromPath("")).toBeNull();
  });
});
