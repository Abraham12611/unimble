"use client";

import Link from "next/link";
import { Robot, Plugs, Users, ArrowRight } from "@phosphor-icons/react";

interface WelcomeStepProps {
  onStart: () => void;
}

export function WelcomeStep({ onStart }: WelcomeStepProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090909] p-6">
      <div
        className="w-full max-w-[420px] rounded-[14px] border border-[#222222] bg-[#161616] p-8"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)" }}
      >
        <div className="flex flex-col items-center text-center">
          <Robot size={32} weight="duotone" className="text-[#F0F0F0]" />

          <h1 className="mt-4 text-[18px] font-medium text-[#F0F0F0]">Welcome to Unimble</h1>

          <p className="mt-2 max-w-[320px] text-[13px] text-[#888888]">
            Set up your AI workspace in about 3 minutes. You can change everything later.
          </p>

          <div className="mt-6 w-full space-y-2 text-left">
            <div className="flex items-center gap-3 rounded-[10px] border border-[#222222] bg-[#111111] px-4 py-3">
              <Plugs size={16} className="shrink-0 text-[#555555]" />
              <span className="text-[12px] text-[#888888]">Connect your tools</span>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border border-[#222222] bg-[#111111] px-4 py-3">
              <Robot size={16} className="shrink-0 text-[#555555]" />
              <span className="text-[12px] text-[#888888]">Pick starter operators</span>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border border-[#222222] bg-[#111111] px-4 py-3">
              <Users size={16} className="shrink-0 text-[#555555]" />
              <span className="text-[12px] text-[#888888]">Invite your team</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onStart}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-[6px] bg-[#F0F0F0] px-6 py-2.5 text-[13px] font-medium text-[#090909] transition-colors duration-200 hover:bg-[#e6e6e6]"
          >
            Get started
            <ArrowRight size={14} weight="bold" />
          </button>

          <Link
            href="/sign-in"
            className="mt-4 text-[12px] text-[#888888] transition-colors duration-200 hover:text-[#F0F0F0]"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
