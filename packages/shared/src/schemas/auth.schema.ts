import * as yup from 'yup';

export const registerSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().min(6, 'Password too short').required('Password is required'),
});

export const loginSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().required('Password is required'),
});

type RegisterInput = yup.InferType<typeof registerSchema>;
type LoginInput = yup.InferType<typeof loginSchema>;

export type LoginDto = LoginInput
export type RegisterDto = RegisterInput