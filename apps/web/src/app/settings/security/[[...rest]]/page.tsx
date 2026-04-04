import { redirect } from "next/navigation";

export default function Page({
  params,
}: {
  params: {
    rest?: string[];
  };
}) {
  const suffix = params.rest?.join("/") ?? "";
  const target = suffix ? `/settings/profile/security/${suffix}` : "/settings/profile/security";

  redirect(target);
}
