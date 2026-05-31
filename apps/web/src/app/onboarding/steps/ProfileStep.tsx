"use client";

import { useState } from "react";
import { Crown, ChartBar, PenNib, Code, X, UserCircle } from "@phosphor-icons/react";
import { SelectableCard } from "../components";
import type { OnboardingData } from "../types";
import { ROLE_OPTIONS } from "../types";

interface ProfileStepProps {
  data: Pick<OnboardingData, "fullName" | "avatarUrl" | "role">;
  onChange: (data: Pick<OnboardingData, "fullName" | "avatarUrl" | "role">) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Crown: <Crown size={24} />,
  ChartBar: <ChartBar size={24} />,
  PenNib: <PenNib size={24} />,
  Code: <Code size={24} />,
};

export function ProfileStep({ data, onChange }: ProfileStepProps) {
  const [previewUrl, setPreviewUrl] = useState(data.avatarUrl);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onChange({ ...data, avatarUrl: url });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-5">
      {/* Avatar Upload */}
      <div className="space-y-1">
        <label className="text-[12px] text-[#666666]">Profile photo</label>
        {previewUrl ? (
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={previewUrl}
                alt="Avatar preview"
                className="h-20 w-20 rounded-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl("");
                  onChange({ ...data, avatarUrl: "" });
                }}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#222222] text-[#555555] hover:text-[#EF4444]"
              >
                <X size={10} weight="bold" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="cursor-pointer text-[12px] text-[#3B82F6] hover:underline">
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="flex flex-col items-center rounded-[14px] border border-dashed border-[#2A2A2A] bg-[#111111] p-8 transition-colors duration-200 hover:border-[#3A3A3A] hover:bg-[#1C1C1C]"
          >
            <UserCircle size={32} className="text-[#555555]" />
            <p className="mt-2 text-[13px] text-[#888888]">Drop an image or click to browse</p>
            <p className="mt-1 text-[12px] text-[#555555]">JPG, PNG. Max 2MB.</p>
            <label className="mt-3 cursor-pointer rounded-[6px] border border-[#2A2A2A] bg-transparent px-3 py-1.5 text-[12px] text-[#F0F0F0] transition-colors duration-200 hover:bg-[#1C1C1C]">
              Browse
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowUrlInput((v) => !v)}
          className="text-[12px] text-[#3B82F6] hover:underline"
        >
          {showUrlInput ? "Hide URL input" : "Use image URL instead"}
        </button>

        {showUrlInput && (
          <input
            type="url"
            value={data.avatarUrl}
            onChange={(e) => {
              onChange({ ...data, avatarUrl: e.target.value });
              setPreviewUrl(e.target.value);
            }}
            placeholder="https://…"
            className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none transition-colors duration-200 focus:border-[#3A3A3A]"
          />
        )}
      </div>

      {/* Full Name */}
      <div className="space-y-1">
        <label htmlFor="onboarding-full-name" className="text-[12px] text-[#666666]">
          Full name
        </label>
        <input
          id="onboarding-full-name"
          value={data.fullName}
          onChange={(e) => onChange({ ...data, fullName: e.target.value })}
          placeholder="e.g. Abraham Dahunsi"
          className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none transition-colors duration-200 focus:border-[#3A3A3A]"
        />
      </div>

      {/* Role */}
      <div className="space-y-2">
        <label className="text-[12px] text-[#666666]">Your role</label>
        <div className="grid grid-cols-2 gap-3">
          {ROLE_OPTIONS.map((role) => (
            <SelectableCard
              key={role.value}
              selected={data.role === role.value}
              onClick={() => onChange({ ...data, role: role.value })}
              icon={ICON_MAP[role.icon]}
              title={role.label}
              description={role.description}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
