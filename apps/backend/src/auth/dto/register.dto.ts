import * as yup from 'yup';

export const registerSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password too short')
    .required('Password is required'),
});

export type RegisterDto = yup.InferType<typeof registerSchema>;
