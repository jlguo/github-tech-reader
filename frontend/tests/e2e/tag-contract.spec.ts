import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeTags } from "../../src/services/tagPolicy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  readFileSync(resolve(__dirname, "../../../tag-contract.json"), "utf-8"),
) as {
  normalize_cases: { input: string[]; expected: string[] }[];
  system_categories: { key: string; label: string; labels: string[]; sort_order: number }[];
};

test.describe("Tag policy contract (frontend matches shared contract)", () => {
  test("normalizeTags matches every contract case", () => {
    for (const c of contract.normalize_cases) {
      expect(normalizeTags(c.input), JSON.stringify(c.input)).toEqual(c.expected);
    }
  });
});
