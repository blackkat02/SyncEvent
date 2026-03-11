export interface IUserResponse {
  id: string;
  email: string;
  displayName?: string;
}

export interface IAuthResponse {
  user: IUserResponse;
  accessToken: string;
  refreshToken: string;
}
