import axios, { type AxiosResponse } from 'axios';
import type { ApiResponse } from '@syncevent/shared';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<any>>) => {
    const serverResponse = response.data;

    if (serverResponse.success) {
      return serverResponse.data;
    }

    return Promise.reject(new Error(serverResponse.message || 'Server Error'));
  },
  (error) => {
    const message = error.response?.data?.message || error.message;
    return Promise.reject(new Error(message));
  }
);

export default apiClient;