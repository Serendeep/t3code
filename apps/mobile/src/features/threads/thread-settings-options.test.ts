import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { RUNTIME_MODE_CHOICES, selectableChoices } from "./thread-settings-options";

const effortDescriptor: Extract<ProviderOptionDescriptor, { type: "select" }> = {
  id: "effort",
  label: "Reasoning",
  type: "select",
  options: [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium", isDefault: true },
    { id: "high", label: "High" },
    { id: "ultrathink", label: "Ultrathink" },
    { id: "ultracode", label: "Ultracode" },
  ],
  currentValue: "high",
  promptInjectedValues: ["ultrathink"],
};

describe("selectableChoices", () => {
  it("keeps ordinary provider choices in their declared order", () => {
    expect(selectableChoices(effortDescriptor).map((choice) => choice.id)).toEqual([
      "low",
      "medium",
      "high",
    ]);
  });

  it("hides prompt-injected and workflow-trigger choices", () => {
    expect(selectableChoices(effortDescriptor).map((choice) => choice.id)).not.toContain(
      "ultrathink",
    );
    expect(selectableChoices(effortDescriptor).map((choice) => choice.id)).not.toContain(
      "ultracode",
    );
  });
});

describe("RUNTIME_MODE_CHOICES", () => {
  it("matches the runtime titles and descriptions used by Web", () => {
    expect(RUNTIME_MODE_CHOICES).toEqual([
      {
        mode: "approval-required",
        label: "Supervised",
        description: "Ask before commands and file changes.",
      },
      {
        mode: "auto-accept-edits",
        label: "Auto-accept edits",
        description: "Auto-approve edits, ask before other actions.",
      },
      {
        mode: "auto",
        label: "Auto",
        description: "Supported providers approve routine actions; others still ask.",
      },
      {
        mode: "full-access",
        label: "Full access",
        description: "Allow commands and edits without prompts.",
      },
    ]);
  });
});
