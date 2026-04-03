import { SignUp } from "@clerk/nextjs";
import { AuthAnalytics } from "../../authAnalytics";
import { clerkAppearance } from "../../clerkAppearance";

export default function Page() {
  return (
    <div>
      <AuthAnalytics event="auth_sign_up_view" />
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/onboarding"
        signInFallbackRedirectUrl="/dashboard"
        appearance={clerkAppearance}
      />
    </div>
  );
}
