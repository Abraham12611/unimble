import { SignIn } from "@clerk/nextjs";
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
    </div>
  );
}
