"use client";

import { useState, useRef, KeyboardEvent, ClipboardEvent } from "react";
import { X } from "@phosphor-icons/react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  validator?: (tag: string) => boolean;
  maxTags?: number;
}

const defaultValidator = (tag: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag);

export function TagInput({
  tags,
  onChange,
  placeholder = "Enter email…",
  validator = defaultValidator,
  maxTags = 50,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) return;
    if (tags.length >= maxTags) return;
    onChange([...tags, trimmed]);
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text");
    const items = paste.split(/[,\n;]+/);
    items.forEach((item) => addTag(item));
  };

  const handleBlur = () => {
    if (input.trim()) {
      addTag(input);
      setInput("");
    }
  };

  return (
    <div
      className="flex min-h-[48px] w-full flex-wrap gap-2 rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 transition-colors duration-200 focus-within:border-[#3A3A3A]"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => {
        const valid = validator(tag);
        return (
          <span
            key={`${tag}-${i}`}
            className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] ${
              valid
                ? "bg-[#222222] text-[#F0F0F0]"
                : "border border-[#EF4444] bg-[rgba(239,68,68,0.08)] text-[#EF4444]"
            }`}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="ml-0.5 text-[#555555] hover:text-[#EF4444]"
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[80px] flex-1 bg-transparent text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555]"
      />
    </div>
  );
}
