import { describe, expect, it } from "vitest";
import { settlementWorker } from "../src/index";

describe("settlement worker bootstrap", () => {
  it("exposes worker metadata", () => {
    expect(settlementWorker.role).toBe("settlement");
  });
});
