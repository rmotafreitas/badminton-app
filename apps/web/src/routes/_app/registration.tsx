import { createFileRoute } from "@tanstack/react-router";
import { RegistrationPage } from "@/features/registrations";

/** The member's own season registration form. */
export const Route = createFileRoute("/_app/registration")({ component: RegistrationPage });
