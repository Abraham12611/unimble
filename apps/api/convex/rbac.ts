export type PlatformRole = "user" | "creator";

export type Permission = "platform:admin";

export const permissionsByRole: Record<PlatformRole, readonly Permission[]> = {
  user: [],
  creator: ["platform:admin"],
};

function parseAllowlist(envValue: string | undefined): Set<string> {
  if (!envValue) return new Set();

  return new Set(
    envValue
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isCreatorIdentity(args: {
  clerkId?: string | null;
  email?: string | null;
}): boolean {
  const allowedEmails = parseAllowlist(process.env.UNIMBLE_CREATOR_EMAILS);
  const allowedClerkIds = parseAllowlist(process.env.UNIMBLE_CREATOR_CLERK_IDS);

  const clerkId = args.clerkId ? args.clerkId.trim().toLowerCase() : "";
  const email = args.email ? args.email.trim().toLowerCase() : "";

  return (
    (clerkId.length > 0 && allowedClerkIds.has(clerkId)) ||
    (email.length > 0 && allowedEmails.has(email))
  );
}

export function normalizePlatformRole(rawRole: string | undefined | null): PlatformRole {
  return rawRole === "creator" ? "creator" : "user";
}

export function derivePlatformRole(args: {
  clerkId?: string | null;
  email?: string | null;
  existingRole?: string | undefined | null;
}): PlatformRole {
  if (isCreatorIdentity({ clerkId: args.clerkId, email: args.email })) {
    return "creator";
  }

  return normalizePlatformRole(args.existingRole);
}

export function hasPermission(role: PlatformRole, permission: Permission): boolean {
  const permissions = permissionsByRole[role];
  return permissions.includes(permission);
}

export function requirePermission(role: PlatformRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error("Forbidden");
  }
}
