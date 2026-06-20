export interface ClubView {
  id: string;
  name: string;
  location: string | null;
  profilePicture: string | null;
  banner: string | null;
  createdAt: Date;
  updatedAt: Date;
  users?: ClubUserView[];
}

export interface ClubUserView {
  id: string;
  email: string | null;
  roles: string[];
  createdAt: Date;
  profile?: { name: string; photo: string | null } | null;
}
