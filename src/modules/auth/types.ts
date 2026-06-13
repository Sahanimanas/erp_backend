export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  schoolId: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    schoolId: string;
    schoolName?: string;
    schoolLogo?: string | null;
  };
}

export interface TokenPayload {
  userId: string;
  schoolId: string;
  role: string;
  permissions: string[];
}
