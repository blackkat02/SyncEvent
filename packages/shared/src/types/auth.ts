export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthTokensResult {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse { 
  user: UserProfile; 
  accessToken: string; 
}