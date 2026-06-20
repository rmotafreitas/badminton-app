export interface CreateClubDto {
  name: string;
  location?: string;
  profilePicture?: File;
  banner?: File;
}

export interface UpdateClubDto {
  name?: string;
  location?: string;
  profilePicture?: File;
  banner?: File;
}

export interface AssignClubDto {
  userId: string;
  clubId: string;
}
