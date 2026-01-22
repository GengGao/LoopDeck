import {
  cn,
  estimateTokenCount,
  formatRelativeTime,
  getScoreEmoji,
  truncateText,
} from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("utils", () => {
  describe("cn", () => {
    it("should merge class names correctly", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
      expect(cn("foo", undefined, "bar")).toBe("foo bar");
      expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    });
  });

  describe("formatRelativeTime", () => {
    it('should return "just now" for recent timestamps', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("just now");
    });

    it("should return minutes ago for timestamps within an hour", () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      expect(formatRelativeTime(thirtyMinAgo)).toBe("30m ago");
    });

    it("should return hours ago for timestamps within a day", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");
    });
  });

  describe("getScoreEmoji", () => {
    it("should return green for high scores", () => {
      expect(getScoreEmoji(0.95)).toBe("🟢");
      expect(getScoreEmoji(0.9)).toBe("🟢");
    });

    it("should return yellow for medium scores", () => {
      expect(getScoreEmoji(0.85)).toBe("🟡");
      expect(getScoreEmoji(0.7)).toBe("🟡");
    });

    it("should return red for low scores", () => {
      expect(getScoreEmoji(0.5)).toBe("🔴");
      expect(getScoreEmoji(0.1)).toBe("🔴");
    });
  });

  describe("truncateText", () => {
    it("should not truncate short text", () => {
      expect(truncateText("hello", 10)).toBe("hello");
    });

    it("should truncate long text with ellipsis", () => {
      expect(truncateText("hello world", 5)).toBe("hello...");
    });
  });

  describe("estimateTokenCount", () => {
    it("should estimate token count based on character length", () => {
      expect(estimateTokenCount("hello world")).toBe(3); // 11 chars / 4 = 2.75, ceil = 3
      expect(estimateTokenCount("a".repeat(100))).toBe(25); // 100 chars / 4 = 25
    });
  });
});
