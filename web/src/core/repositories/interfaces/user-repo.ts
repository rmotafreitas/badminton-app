export interface UserView {
  id: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  clubId: string | null;
  profile?: { name: string; photo: string | null } | null;
}

export interface UserRepo {
  getAll(): Promise<UserView[]>;
}
