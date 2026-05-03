"use client";

import { useState, useCallback } from "react";
import { Key, Plus, Trash, Copy, Check, Eye, EyeSlash, Warning } from "@phosphor-icons/react";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsed?: number;
  permissions: string[];
};

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button type="button" onClick={handle}
      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#2A2A2A] hover:text-[#888888]">
      {copied ? <Check size={13} className="text-[#22C55E]" /> : <Copy size={13} />}
    </button>
  );
}

function NewKeyModal({ onClose, onCreate }: { onClose: () => void; onCreate: (key: ApiKey, rawKey: string) => void }) {
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<string[]>(["read"]);

  const ALL_PERMS = ["read", "write", "execute", "admin"];

  function toggle(p: string) {
    setPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function handleCreate() {
    if (!name.trim()) return;
    const raw = `uk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const key: ApiKey = {
      id: Math.random().toString(36).slice(2),
      name: name.trim(),
      prefix: raw.slice(0, 8),
      createdAt: Date.now(),
      permissions: perms,
    };
    onCreate(key, raw);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-[16px] border border-[#2A2A2A] bg-[#161616] p-6">
        <div className="text-[15px] font-medium">Create API Key</div>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Key name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production webhook"
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
          </div>
          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Permissions</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PERMS.map((p) => (
                <button key={p} type="button" onClick={() => toggle(p)}
                  className={`rounded-[6px] border px-3 py-1 text-[12px] capitalize transition-colors ${perms.includes(p) ? "border-[#6366F1] bg-[rgba(99,102,241,0.1)] text-[#F0F0F0]" : "border-[#2A2A2A] bg-[#1C1C1C] text-[#555555] hover:text-[#888888]"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[13px] hover:bg-[#222222]">
            Cancel
          </button>
          <button type="button" onClick={handleCreate} disabled={!name.trim() || perms.length === 0}
            className="rounded-[6px] bg-[#6366F1] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#5153CC] disabled:opacity-40">
            Generate Key
          </button>
        </div>
      </div>
    </div>
  );
}

function NewKeyReveal({ rawKey, onDone }: { rawKey: string; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="rounded-[12px] border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.04)] p-4 space-y-2">
      <div className="flex items-center gap-2 text-[#22C55E]">
        <Check size={14} weight="bold" />
        <span className="text-[13px] font-medium">API key created — copy it now</span>
      </div>
      <div className="flex items-center gap-2 rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2">
        <Key size={13} className="shrink-0 text-[#555555]" />
        <span className="flex-1 font-mono text-[12px]">
          {visible ? rawKey : rawKey.slice(0, 8) + "•".repeat(rawKey.length - 8)}
        </span>
        <button type="button" onClick={() => setVisible((v) => !v)}
          className="text-[#555555] hover:text-[#888888]">
          {visible ? <EyeSlash size={13} /> : <Eye size={13} />}
        </button>
        <CopyButton text={rawKey} />
      </div>
      <div className="text-[11px] text-[#F59E0B]">
        <Warning size={11} className="inline mr-1" />
        This key will not be shown again. Store it securely.
      </div>
      <button type="button" onClick={onDone}
        className="mt-1 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1 text-[12px] hover:bg-[#222222]">
        I've saved it
      </button>
    </div>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleCreate(key: ApiKey, raw: string) {
    setKeys((prev) => [key, ...prev]);
    setNewRawKey(raw);
    setShowModal(false);
  }

  function handleDelete(id: string) {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] font-medium">API Keys</div>
          <div className="text-[12px] text-[#555555]">Use API keys to authenticate requests from your applications</div>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium hover:bg-[#222222]">
          <Plus size={13} /> New key
        </button>
      </div>

      {newRawKey && <NewKeyReveal rawKey={newRawKey} onDone={() => setNewRawKey(null)} />}

      {keys.length === 0 && !newRawKey && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] py-10 text-center">
          <Key size={28} className="mx-auto text-[#2A2A2A]" />
          <div className="mt-2 text-[13px] text-[#555555]">No API keys yet.</div>
          <button type="button" onClick={() => setShowModal(true)}
            className="mt-3 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium hover:bg-[#222222]">
            Create your first key
          </button>
        </div>
      )}

      {keys.length > 0 && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#222222]">
                {["Name", "Prefix", "Permissions", "Created", "Last used", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C1C]">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-[#1A1A1A]">
                  <td className="px-4 py-3 text-[13px] font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#888888]">{k.prefix}…</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.map((p) => (
                        <span key={p} className="rounded-[4px] bg-[rgba(99,102,241,0.1)] px-1.5 py-0.5 text-[10px] capitalize text-[#6366F1]">{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#555555]">{ago(k.createdAt)}</td>
                  <td className="px-4 py-3 text-[12px] text-[#555555]">{k.lastUsed ? ago(k.lastUsed) : "Never"}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setConfirmDeleteId(k.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[rgba(239,68,68,0.1)] hover:text-[#EF4444]">
                      <Trash size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <NewKeyModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-[16px] border border-[#2A2A2A] bg-[#161616] p-6">
            <div className="flex items-center gap-2 text-[#EF4444]">
              <Warning size={18} /><span className="text-[15px] font-medium">Revoke API key?</span>
            </div>
            <p className="mt-2 text-[13px] text-[#888888]">Any applications using this key will immediately lose access.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)}
                className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[13px] hover:bg-[#222222]">Cancel</button>
              <button type="button" onClick={() => handleDelete(confirmDeleteId)}
                className="rounded-[6px] bg-[#EF4444] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#DC2626]">Revoke</button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#555555]">
        API keys grant access to your workspace data. Never commit keys to source control. Rotate them regularly.
      </div>
    </div>
  );
}
