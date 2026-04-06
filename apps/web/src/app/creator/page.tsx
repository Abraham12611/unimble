import { makeFunctionReference } from "convex/server";

import { requireCreator } from "@/lib/requireCreator";

type UserRow = {
  _id: string;
  email: string;
  role?: string;
  createdAt: number;
};

type ListUsersPage = {
  page: UserRow[];
  continueCursor: string | null;
  isDone: boolean;
};

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { convex } = await requireCreator();

  const params = (await searchParams) ?? {};
  const cursorParam = params.cursor;
  const cursor = Array.isArray(cursorParam) ? (cursorParam[0] ?? null) : (cursorParam ?? null);

  const listUsers = makeFunctionReference<"query">("users:listUsers");
  const results = (await convex.query(listUsers, {
    paginationOpts: {
      cursor,
      numItems: 100,
    },
  })) as ListUsersPage;
  const users = results.page;

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

        {!results.isDone && results.continueCursor ? (
          <div className="border-t border-[#222222] px-4 py-3 text-sm">
            <a
              className="text-[#A0A0A0] hover:text-[#F0F0F0]"
              href={`/creator?cursor=${encodeURIComponent(results.continueCursor)}`}
            >
              Next page
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
