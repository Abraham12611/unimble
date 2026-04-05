import { makeFunctionReference } from "convex/server";

import { requireCreator } from "@/lib/requireCreator";

type UserRow = {
  _id: string;
  email: string;
  role?: string;
  createdAt: number;
};

export default async function Page() {
  const { convex } = await requireCreator();

  const listUsers = makeFunctionReference<"query">("users:listUsers");
  const users = (await convex.query(listUsers, {})) as UserRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Creator</h1>
        <p className="mt-1 text-sm text-[#888888]">Platform administration</p>
      </div>

      <div className="rounded-xl border border-[#222222] bg-[#161616]">
        <div className="border-b border-[#222222] px-4 py-3">
          <h2 className="text-sm font-medium">Users</h2>
        </div>
        <div className="divide-y divide-[#222222]">
          {users.map((user) => (
            <div key={user._id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm text-[#F0F0F0]">{user.email}</div>
                <div className="mt-0.5 text-xs text-[#888888]">{user._id}</div>
              </div>
              <div className="text-xs text-[#A0A0A0]">{user.role ?? "user"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
