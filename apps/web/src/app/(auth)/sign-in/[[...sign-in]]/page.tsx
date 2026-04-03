import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { AuthAnalytics } from "../../authAnalytics";
import { clerkAppearance } from "../../clerkAppearance";

export default function Page() {
  return (
    <div>
      <AuthAnalytics event="auth_sign_in_view" />
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
        appearance={clerkAppearance}
      />
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href="/sign-in/forgot-password" className="text-[#C7C7C7] hover:text-[#F0F0F0]">
          Forgot password?
        </Link>
        <Link href="/sign-up" className="text-[#C7C7C7] hover:text-[#F0F0F0]">
          Create an account
        </Link>
      </div>
    </div>
  );
}
