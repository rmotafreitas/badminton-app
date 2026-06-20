export interface Club {
  id: string;
  name: string;
  location: string | null;
  profilePicture: string | null;
  banner: string | null;
  createdAt: Date;
  updatedAt: Date;
  users?: ClubUser[];
}

export interface ClubUser {
  id: string;
  email: string | null;
  roles: string[];
  createdAt: Date;
  profile?: { name: string; photo: string | null } | null;
}
