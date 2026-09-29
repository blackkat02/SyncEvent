export interface UserResponse {
  id: string;
  email: string;
  displayName?: string;
}

export interface AuthTokensResult {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}
