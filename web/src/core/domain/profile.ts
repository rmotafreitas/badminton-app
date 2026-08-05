export interface Profile {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  birthday: string | null;
  sex: string | null;
  photo: string | null;
  banner: string | null;
  bio: string | null;
  eloSingles: number;
  eloDoubles: number;
  createdAt: string;
  updatedAt: string;
}
