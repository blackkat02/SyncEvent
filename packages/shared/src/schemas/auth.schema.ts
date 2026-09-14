import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string('Email is required').email('Invalid email'),
  password: z.string('Password is required').min(6, 'Password too short'),
});

export const loginSchema = z.object({
  email: z.string('Email is required').email('Invalid email'),
  password: z.string('Password is required').min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type LoginDto = LoginInput
export type RegisterDto = RegisterInput
