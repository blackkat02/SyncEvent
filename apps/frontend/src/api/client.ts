import axios, { type AxiosResponse, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@syncevent/shared';

interface ApiClient extends Omit<AxiosInstance, 'get' | 'post' | 'put' | 'delete' | 'patch'> {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

export const apiGet = <T>(url: string) => apiClient.get<T>(url);
export const apiPost = <T>(url: string, data?: unknown) => apiClient.post<T>(url, data);
export const apiPut = <T>(url: string, data?: unknown) => apiClient.put<T>(url, data);
export const apiDelete = <T>(url: string) => apiClient.delete<T>(url);

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
}) as ApiClient;

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

export default apiClient;