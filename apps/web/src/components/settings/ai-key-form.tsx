"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { saveAiKey } from "@/app/dashboard/ai-actions";
import { ActionForm, inputClass, SubmitButton } from "@/components/dashboard/forms";
import type { AiProvider } from "@/generated/prisma/enums";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { cn } from "@/lib/utils";

export function AiKeyForm({ current }: { current: { provider: AiProvider; model: string; keyHint: string } | null }) {
  const [provider, setProvider] = useState<AiProvider>(current?.provider ?? "ANTHROPIC");
  const info = AI_PROVIDERS[provider];
  const sameProvider = current?.provider === provider;
  // Controlled so a failed save doesn't wipe it (React resets uncontrolled fields after an action).
  const [model, setModel] = useState(current?.model ?? AI_PROVIDERS.ANTHROPIC.defaultModel);

  function pick(p: AiProvider) {
    setProvider(p);
    setModel(current?.provider === p ? current.model : AI_PROVIDERS[p].defaultModel);
  }

  return (
    <ActionForm action={saveAiKey} className="flex flex-col gap-4 px-5 py-5">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Provider</legend>
        {(Object.keys(AI_PROVIDERS) as AiProvider[]).map((p) => (
          <label
            key={p}
            className={cn(
              "press flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors",
              p === provider ? "border-glow/50 bg-glow/10 text-text" : "border-line-strong text-muted hover:text-text",
            )}
          >
            <input
              type="radio"
              name="provider"
              value={p}
              checked={p === provider}
              onChange={() => pick(p)}
              className="sr-only"
            />
            <span className="font-medium">{AI_PROVIDERS[p].label}</span>
            <span className="text-faint">{AI_PROVIDERS[p].company}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm text-muted">
          API key
          <input
            key={provider}
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={sameProvider ? `Saved key ending ${current.keyHint}` : provider === "ANTHROPIC" ? "sk-ant-…" : "sk-…"}
            className={cn(inputClass, "w-full font-mono")}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm text-muted">
          Model
          <input
            name="model"
            list={`models-${provider}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "OPENAI" ? "Best GPT-5 on your key" : undefined}
            autoComplete="off"
            spellCheck={false}
            className={cn(inputClass, "w-full font-mono")}
          />
          <datalist id={`models-${provider}`}>
            {info.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm">{current ? "Save" : `Connect ${info.label}`}</SubmitButton>
        <a
          href={info.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          Get an {info.company} API key
          <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="text-xs leading-relaxed text-faint">
        Ripple checks the key, then stores it encrypted and uses it only when you ask for an edit. Usage is billed to
        your {info.company} account. A {info.label} chat subscription doesn’t include API access.
      </p>
    </ActionForm>
  );
}
