export interface UserResponse {
  id: string;
  email: string;
  displayName?: string;
}

export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}
