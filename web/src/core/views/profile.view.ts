export interface ProfileView {
  id: string;
  userId: string;
  name: string;
  birthday: string | null;
  sex: string | null;
  photo: string | null;
  banner: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}
