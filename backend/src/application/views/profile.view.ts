export interface ProfileView {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  birthday: Date | null;
  sex: string | null;
  photo: string | null;
  banner: string | null;
  bio: string | null;
  eloSingles: number;
  eloDoubles: number;
  createdAt: Date;
  updatedAt: Date;
}
