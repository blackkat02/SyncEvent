export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null; // ← було string | null відповідно до Prisma
  avatarUrl: string | null;
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}