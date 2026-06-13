import { describe, it, expect } from "vitest";
import {
  formatTokens,
  formatMs,
  formatRatio,
  errorSeverity,
  SEVERITY_LABEL,
} from "@/app/observability/format";

describe("observability/format", () => {
  describe("formatTokens", () => {
    it("should group thousands for a normal count (happy path)", () => {
      expect(formatTokens(1234567)).toBe("1,234,567");
    });
    it("should render zero as 0 (edge case)", () => {
      expect(formatTokens(0)).toBe("0");
    });
    it("should render an em dash for a non-finite value (error path)", () => {
      expect(formatTokens(Number.NaN)).toBe("—");
    });
  });

  describe("formatMs", () => {
    it("should keep sub-second values in ms (happy path)", () => {
      expect(formatMs(420)).toBe("420 ms");
    });
    it("should render seconds for values >= 1000ms (state change)", () => {
      expect(formatMs(1500)).toBe("1.50 s");
    });
    it("should render an em dash for a non-finite value (error path)", () => {
      expect(formatMs(Number.POSITIVE_INFINITY)).toBe("—");
    });
  });

  describe("formatRatio", () => {
    it("should render a fraction as a percentage (happy path)", () => {
      expect(formatRatio(0.1234)).toBe("12.3%");
    });
    it("should clamp out-of-range values (edge case)", () => {
      expect(formatRatio(1.5)).toBe("100.0%");
      expect(formatRatio(-0.2)).toBe("0.0%");
    });
    it("should render an em dash for a non-finite value (error path)", () => {
      expect(formatRatio(Number.NaN)).toBe("—");
    });
  });

  describe("errorSeverity", () => {
    it("should bucket a small count as info (happy path)", () => {
      expect(errorSeverity(1)).toBe("info");
    });
    it("should bucket a moderate count as warning (state change)", () => {
      expect(errorSeverity(5)).toBe("warning");
    });
    it("should bucket a large count as critical (edge case)", () => {
      expect(errorSeverity(42)).toBe("critical");
    });
    it("should expose a human label for every severity (mapping)", () => {
      expect(SEVERITY_LABEL.info).toBe("Low");
      expect(SEVERITY_LABEL.warning).toBe("Elevated");
      expect(SEVERITY_LABEL.critical).toBe("High");
    });
  });
});
