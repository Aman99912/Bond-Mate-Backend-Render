export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest { 
  name: string;
  email: string;
  password: string;
  mobileNumber?: string;
  subPassword?: string;
  avatar?: string;
  bio?: string;
  dob?: string;
  gender?: string;
}

export interface SendOTPRequest {
  mobileNumber: string;
}

export interface VerifyOTPRequest {
  mobileNumber: string;
  otp: string;
}

export interface ResendOTPRequest {
  mobileNumber: string;
}
