class ApiService {
  private baseURL: string;
  private authToken: string | null = null;

  constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          status: response.status,
          message: errorData.message || `HTTP ${response.status}`,
          response: { data: errorData }
        };
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw {
          status: 0,
          message: 'Network error - please check your connection',
          response: { data: { message: 'Network error' } }
        };
      }
      throw error;
    }
  }

  async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async patch<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // File upload method
  async uploadFile<T = any>(
    endpoint: string,
    file: {
      uri: string;
      name: string;
      type: string;
    },
    options?: {
      fieldName?: string;
      extraFields?: Record<string, string | number | boolean>;
    }
  ): Promise<T> {
    const formData = new FormData();
    const fieldName = options?.fieldName || 'file';
    formData.append(fieldName, {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
    if (options?.extraFields) {
      Object.entries(options.extraFields).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      body: formData,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        status: response.status,
        message: errorData.message || `HTTP ${response.status}`,
        response: { data: errorData }
      };
    }

    return response.json();
  }
}

export const apiService = new ApiService();