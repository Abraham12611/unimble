"use client";

import { useState } from "react";
import { FloppyDisk, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

const TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Africa/Lagos",
  "Asia/Tokyo",
];
const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
const LANGUAGES = ["English (US)", "English (UK)"];

export default function PreferencesPage() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [language, setLanguage] = useState("English (US)");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [shortcuts, setShortcuts] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // TODO: Wire to Convex user prefs mutation
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Appearance</div>
        <div className="mt-4">
          <label className="mb-2 block text-[12px] text-[#666666]">Theme</label>
          <div className="space-y-1.5">
            {(["light", "dark", "system"] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="theme"
                  value={t}
                  checked={theme === t}
                  onChange={() => setTheme(t)}
                  className="accent-[#6366F1]"
                />
                <span className="text-[13px] text-[#F0F0F0] capitalize">{t}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Regional */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Regional</div>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
            >
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Date Format</label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[12px] text-[#666666]">Time Format</label>
            <div className="space-y-1.5">
              {(
                [
                  { val: "12h", label: "12-hour (3:00 PM)" },
                  { val: "24h", label: "24-hour (15:00)" },
                ] as const
              ).map((opt) => (
                <label key={opt.val} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="timeFormat"
                    value={opt.val}
                    checked={timeFormat === opt.val}
                    onChange={() => setTimeFormat(opt.val)}
                    className="accent-[#6366F1]"
                  />
                  <span className="text-[13px] text-[#F0F0F0]">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Keyboard Shortcuts</div>
        <div className="mt-3 flex items-center justify-between">
          <label className="cursor-pointer text-[13px] text-[#F0F0F0]">
            Enable keyboard shortcuts
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={shortcuts}
            onClick={() => setShortcuts((v) => !v)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              shortcuts ? "bg-[#6366F1]" : "bg-[#2A2A2A]"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-[#F0F0F0] shadow transition-transform",
                shortcuts ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            "flex items-center gap-1.5 rounded-[6px] border px-4 py-2 text-[13px] font-medium transition-colors",
            saved
              ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] text-[#22C55E]"
              : "border-[#2A2A2A] bg-[#1C1C1C] text-[#F0F0F0] hover:bg-[#222222]"
          )}
        >
          {saved ? <CheckCircle size={14} weight="fill" /> : <FloppyDisk size={14} />}
          {saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
