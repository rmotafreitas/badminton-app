export interface AuthInitView {
  type: "redirect" | "code-sent";
  redirectUrl?: string;
  message: string;
}

export interface AuthUserView {
  userId: string;
  roles: string[];
  elo: number;
  email: string | null;
  phone: string | null;
  clubId: string | null;
}
