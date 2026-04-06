import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "../../../(auth)/clerkAppearance";

export default function Page() {
  return (
    <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)]">
      <UserProfile path="/settings/profile" routing="path" appearance={clerkAppearance}>
        <UserProfile.Page label="account" />
        <UserProfile.Page label="security" />
      </UserProfile>
    </div>
  );
}
