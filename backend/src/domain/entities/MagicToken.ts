export interface MagicToken {
  id: string;
  token: string;
  target: string;
  type: "email" | "phone";
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}
