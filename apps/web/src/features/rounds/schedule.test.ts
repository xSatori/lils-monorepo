// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import {
  getDefaultRoundSchedule,
  validateAdminRoundSchedule,
  validateRoundSchedule,
} from "./validation";
import { getRoundAbi } from "./contracts";

describe("Rounds v2 schedule", () => {
  it("defaults production rounds to a 24-hour moderation review buffer", () => {
    const schedule = getDefaultRoundSchedule(1_000_000, false);

    expect(schedule.votingStart - schedule.submissionsClose).toBe(86_400);
    expect(validateRoundSchedule(schedule, false, 1_000_000)).toBeUndefined();
  });

  it("defaults and enforces three five-minute Sepolia test phases", () => {
    const schedule = getDefaultRoundSchedule(1_000_000, true);

    expect(schedule.submissionsClose - schedule.submissionsOpen).toBe(300);
    expect(schedule.votingStart - schedule.submissionsClose).toBe(300);
    expect(schedule.votingEnd - schedule.votingStart).toBe(300);
    expect(validateRoundSchedule(schedule, true, 1_000_000)).toBeUndefined();

    expect(
      validateRoundSchedule(
        { ...schedule, votingStart: schedule.votingStart + 1 },
        true,
        1_000_000,
      ),
    ).toContain("exactly five minutes");
  });

  it("rejects a missing review window or expired schedule", () => {
    expect(
      validateRoundSchedule(
        {
          submissionsOpen: 1_000_100,
          submissionsClose: 1_000_200,
          votingStart: 1_000_200,
          votingEnd: 1_000_400,
        },
        false,
        1_000_000,
      ),
    ).toContain("ordered");

    expect(
      validateRoundSchedule(
        {
          submissionsOpen: 999_000,
          submissionsClose: 999_100,
          votingStart: 999_200,
          votingEnd: 999_300,
        },
        false,
        1_000_000,
      ),
    ).toContain("future");
  });
});

describe("V6 admin schedule", () => {
  it("uses a V6-only schedule write ABI", () => {
    expect(
      getRoundAbi(6).some(
        (item) => item.type === "function" && item.name === "setSchedule",
      ),
    ).toBe(true);
    expect(
      getRoundAbi(5).some(
        (item) => item.type === "function" && item.name === "setSchedule",
      ),
    ).toBe(false);
  });
  it("requires submission opening to be in the future", () => {
    const schedule = getDefaultRoundSchedule(1_000_000, false);
    expect(
      validateAdminRoundSchedule(schedule, false, 1_000_000),
    ).toBeUndefined();
    expect(
      validateAdminRoundSchedule(
        { ...schedule, submissionsOpen: 1_000_000 },
        false,
        1_000_000,
      ),
    ).toContain("future");
  });
});
