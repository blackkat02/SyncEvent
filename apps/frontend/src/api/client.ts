import axios, { type AxiosResponse } from 'axios';
import type { ApiResponse } from '@syncevent/shared';


const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

apiClient.interceptors.response.use(
  <T>(response: AxiosResponse<ApiResponse<T>>): T => {
    const serverResponse = response.data;

    if (serverResponse.success) {
      return serverResponse.data;
    }

    throw new Error(serverResponse.message || 'Сталася помилка на сервері');
  },
  (error) => {
    const message = error.response?.data?.message || error.message;
    return Promise.reject(new Error(message));
  }
);

export const apiGet = <T>(url: string): Promise<T> =>
  apiClient.get<T>(url) as unknown as Promise<T>;

export const apiPost = <T>(url: string, data?: unknown): Promise<T> =>
  apiClient.post<T>(url, data) as unknown as Promise<T>;

export const apiPut = <T>(url: string, data?: unknown): Promise<T> =>
  apiClient.put<T>(url, data) as unknown as Promise<T>;

export const apiDelete = <T>(url: string): Promise<T> =>
  apiClient.delete<T>(url) as unknown as Promise<T>;

export default apiClient;