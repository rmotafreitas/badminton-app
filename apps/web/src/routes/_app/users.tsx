import { createFileRoute } from "@tanstack/react-router";
import { useSessionUser } from "@/features/auth";
import { MembersPage } from "@/features/members";

export const Route = createFileRoute("/_app/users")({ component: () => <MembersPage user={useSessionUser()} /> });
