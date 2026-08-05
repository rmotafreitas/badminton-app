export interface AuthInitView {
  type: "redirect" | "code-sent";
  redirectUrl?: string;
  message: string;
}

export interface AuthUserView {
  userId: string;
  roles: string[];
  eloSingles: number;
  eloDoubles: number;
  email: string | null;
  phone: string | null;
  clubId: string | null;
}
