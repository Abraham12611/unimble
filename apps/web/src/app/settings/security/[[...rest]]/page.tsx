import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params:
    | {
        rest?: string[];
      }
    | Promise<{
        rest?: string[];
      }>;
}) {
  const { rest } = await params;
  const suffix = rest?.join("/") ?? "";
  const target = suffix ? `/settings/profile/security/${suffix}` : "/settings/profile/security";

  redirect(target);
}
