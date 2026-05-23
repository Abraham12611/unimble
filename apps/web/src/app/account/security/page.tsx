"use client";

import { useState } from "react";
import {
  Shield,
  Monitor,
  DeviceMobile,
  GoogleLogo,
  GithubLogo,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

const MOCK_SESSIONS = [
  {
    id: "s1",
    device: "Chrome on macOS",
    location: "Lagos, NG",
    lastSeen: "Active now",
    current: true,
  },
  {
    id: "s2",
    device: "Safari on iOS",
    location: "Lagos, NG",
    lastSeen: "2 hours ago",
    current: false,
  },
];

const MOCK_CONNECTED = [
  { id: "google", name: "Google", email: "john.doe@gmail.com", connected: true },
  { id: "github", name: "GitHub", connected: false },
];

export default function SecurityPage() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const passwordMismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSave = currentPw.length > 0 && newPw.length >= 8 && newPw === confirmPw;

  return (
    <div className="space-y-6">
      {/* Password */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Password</div>
        <div className="mt-4 space-y-3">
          {[
            {
              label: "Current Password",
              value: currentPw,
              set: setCurrentPw,
              show: showCurrent,
              toggle: () => setShowCurrent((v) => !v),
            },
            {
              label: "New Password",
              value: newPw,
              set: setNewPw,
              show: showNew,
              toggle: () => setShowNew((v) => !v),
            },
            {
              label: "Confirm New Password",
              value: confirmPw,
              set: setConfirmPw,
              show: showConfirm,
              toggle: () => setShowConfirm((v) => !v),
            },
          ].map((field) => (
            <div key={field.label} className="space-y-1">
              <label className="text-[12px] text-[#666666]">{field.label}</label>
              <div className="relative">
                <input
                  type={field.show ? "text" : "password"}
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  className={cn(
                    "w-full rounded-[6px] border bg-[#1A1A1A] px-3 py-2 pr-9 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555]",
                    field.label === "Confirm New Password" && passwordMismatch
                      ? "border-[rgba(239,68,68,0.4)] focus:border-[rgba(239,68,68,0.6)]"
                      : "border-[#2A2A2A] focus:border-[#3A3A3A]"
                  )}
                />
                <button
                  type="button"
                  onClick={field.toggle}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555555] hover:text-[#888888]"
                >
                  {field.show ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}
          {passwordMismatch && (
            <p className="text-[11px] text-[#EF4444]">Passwords do not match.</p>
          )}
          {newPw.length > 0 && newPw.length < 8 && (
            <p className="text-[11px] text-[#F59E0B]">Password must be at least 8 characters.</p>
          )}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={!canSave}
              className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:text-[#555555]"
            >
              Change Password
            </button>
          </div>
        </div>
      </div>

      {/* Two-factor auth */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Two-Factor Authentication</div>
          <span className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
            Enabled
          </span>
        </div>
        <div className="mt-3 text-[12px] text-[#888888]">
          Method: Authenticator app &nbsp;·&nbsp; Backup codes: 8 remaining
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            View Backup Codes
          </button>
          <button
            type="button"
            className="rounded-[6px] border border-[rgba(239,68,68,0.3)] px-3 py-1.5 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
          >
            Disable 2FA
          </button>
        </div>
      </div>

      {/* Active sessions */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="border-b border-[#222222] px-5 py-3">
          <div className="text-[15px] font-medium text-[#F0F0F0]">Active Sessions</div>
        </div>
        <div className="divide-y divide-[#1A1A1A]">
          {MOCK_SESSIONS.map((session) => (
            <div key={session.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#1A1A1A] text-[#555555]">
                  {session.device.includes("iOS") ? (
                    <DeviceMobile size={16} />
                  ) : (
                    <Monitor size={16} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[13px] text-[#F0F0F0]">
                    {session.device}
                    {session.current && (
                      <span className="rounded-[4px] bg-[rgba(34,197,94,0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[#22C55E]">
                        current
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#555555]">
                    {session.location} · {session.lastSeen}
                  </div>
                </div>
              </div>
              {!session.current && (
                <button
                  type="button"
                  className="rounded-[6px] border border-[rgba(239,68,68,0.3)] px-3 py-1 text-[12px] text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-[#222222] px-5 py-3">
          <button
            type="button"
            className="text-[12px] text-[#888888] transition-colors hover:text-[#EF4444]"
          >
            Sign out all other sessions
          </button>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="border-b border-[#222222] px-5 py-3">
          <div className="text-[15px] font-medium text-[#F0F0F0]">Connected Accounts</div>
        </div>
        <div className="divide-y divide-[#1A1A1A]">
          {MOCK_CONNECTED.map((acct) => (
            <div key={acct.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#1A1A1A] text-[#F0F0F0]">
                  {acct.id === "google" ? <GoogleLogo size={16} /> : <GithubLogo size={16} />}
                </div>
                <div>
                  <div className="text-[13px] text-[#F0F0F0]">{acct.name}</div>
                  {acct.connected && "email" in acct ? (
                    <div className="text-[11px] text-[#555555]">{acct.email}</div>
                  ) : (
                    <div className="text-[11px] text-[#555555]">Not connected</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={cn(
                  "rounded-[6px] border px-3 py-1 text-[12px] font-medium transition-colors",
                  acct.connected
                    ? "border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)]"
                    : "border-[#2A2A2A] bg-[#1C1C1C] text-[#F0F0F0] hover:bg-[#222222]"
                )}
              >
                {acct.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
