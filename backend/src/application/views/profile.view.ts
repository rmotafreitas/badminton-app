export interface ProfileView {
  id: string;
  userId: string;
  name: string;
  birthday: Date | null;
  sex: string | null;
  photo: string | null;
  banner: string | null;
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
}
