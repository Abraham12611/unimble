import { TaskResetPassword } from "@clerk/nextjs";

import { AuthAnalytics } from "../authAnalytics";

export default function Page() {
  return (
    <div>
      <AuthAnalytics event="auth_reset_password_view" />
      <TaskResetPassword redirectUrlComplete="/dashboard" />
    </div>
  );
}
