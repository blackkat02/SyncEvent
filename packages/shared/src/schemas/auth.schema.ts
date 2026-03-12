import * as yup from 'yup';

export const registerSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().min(6, 'Password too short').required('Password is required'),
});

export type RegisterInput = yup.InferType<typeof registerSchema>;

export interface UserProfile {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  accessToken: string;
  refreshToken: string;
}