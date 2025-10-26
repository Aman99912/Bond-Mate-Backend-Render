declare namespace Express {
  export interface Request {
    user?: {
      userId: string;
      email: string;
      iat?: number;
      exp?: number;
    };
  }
}


