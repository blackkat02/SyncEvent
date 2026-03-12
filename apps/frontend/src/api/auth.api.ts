import axios from 'axios';
import { RegisterInput, AuthResponse } from '@syncevent/shared';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

export const authApi = {
  register: (data: RegisterInput) => api.post<AuthResponse>('/auth/register', data),
  login: (data: RegisterInput) => api.post<AuthResponse>('/auth/login', data),
};