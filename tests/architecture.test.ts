import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const coreRoot = new URL("../src/core/", import.meta.url);
const files = readdirSync(coreRoot).filter((file) => file.endsWith(".ts"));

function imports(file: string): string[] {
  const source = readFileSync(new URL(file, coreRoot), "utf8");
  return ts.preProcessFile(source).importedFiles.map((entry) => entry.fileName);
}

describe("core dependency boundaries", () => {
  it.each(files)("%s only imports core modules", (file) => {
    for (const dependency of imports(file)) {
      expect(dependency, `${file}: ${dependency}`).toMatch(/^\.\/[^/]+\.js$/);
    }
  });

  it("leaf domains never depend on the village orchestrator", () => {
    for (const file of files.filter((name) => name !== "village.ts")) {
      expect(imports(file), fileURLToPath(new URL(file, coreRoot))).not.toContain("./village.js");
    }
  });
});
