import { Request, Response } from 'express';
import Admin from '@/models/Admin';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { generateToken } from '@/utils/jwt';
import { ApiResponse } from '@/types';

// Admin Login
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  // Find admin
  const admin = await Admin.findOne({ email }).select('+password');

  if (!admin) {
    throw new AppError('Invalid credentials', 401);
  }

  if (!admin.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  // Check password
  const isPasswordValid = await admin.comparePassword(password);

  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401);
  }

  // Update last login
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = req.ip || req.socket.remoteAddress || '';
  await admin.save();

  // Generate token
  const token = generateToken({ userId: (admin._id as any).toString(), email: admin.email });

  // Remove password from response
  const adminData = admin.toObject() as any;
  delete adminData.password;

  const response: ApiResponse = {
    success: true,
    message: 'Login successful',
    data: {
      admin: adminData,
      token,
    },
  };

  return res.json(response);
});

// Get Admin Profile
export const getAdminProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  const admin = await Admin.findById(userId).select('-password');

  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  if (!admin.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Profile retrieved successfully',
    data: { admin },
  };

  return res.json(response);
});

// Refresh Token
export const refreshAdminToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  const admin = await Admin.findById(userId);

  if (!admin || !admin.isActive) {
    throw new AppError('Invalid or inactive account', 401);
  }

  // Generate new token
  const token = generateToken({ userId: (admin._id as any).toString(), email: admin.email });

  const response: ApiResponse = {
    success: true,
    message: 'Token refreshed successfully',
    data: { token },
  };

  return res.json(response);
});

// Logout
export const adminLogout = asyncHandler(async (req: Request, res: Response) => {
  // For JWT, logout is handled client-side by removing the token
  // This endpoint can be used for logging activity
  const response: ApiResponse = {
    success: true,
    message: 'Logged out successfully',
    data: {},
  };

  return res.json(response);
});

// Get All Admins (Only for super_admin)
export const getAllAdmins = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 20, search, role } = req.query;

  const query: any = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  if (role) {
    query.role = role;
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const [admins, total] = await Promise.all([
    Admin.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Admin.countDocuments(query),
  ]);

  const response: ApiResponse = {
    success: true,
    message: 'Admins retrieved successfully',
    data: {
      admins,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  };

  return res.json(response);
});

// Create Admin (Only for super_admin via Postman/Backend)
export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role, permissions } = req.body;

  if (!name || !email || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }

  // Check if admin already exists
  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    throw new AppError('Admin with this email already exists', 409);
  }

  const admin = await Admin.create({
    name,
    email,
    password,
    role: role || 'admin',
    permissions: permissions || [],
    isActive: true,
  });

  const adminData = admin.toObject() as any;
  delete adminData.password;

  const response: ApiResponse = {
    success: true,
    message: 'Admin created successfully',
    data: { admin: adminData },
  };

  return res.status(201).json(response);
});

// Update Admin (Only for super_admin)
export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, role, permissions, isActive } = req.body;

  const admin = await Admin.findById(id);

  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  if (name) admin.name = name;
  if (role) admin.role = role;
  if (permissions !== undefined) admin.permissions = permissions;
  if (isActive !== undefined) admin.isActive = isActive;

  await admin.save();

  const adminData = admin.toObject() as any;
  delete adminData.password;

  const response: ApiResponse = {
    success: true,
    message: 'Admin updated successfully',
    data: { admin: adminData },
  };

  return res.json(response);
});

// Delete Admin (Only for super_admin)
export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const currentUserId = (req as any).user?.userId;

  // Prevent self-deletion
  if (id === currentUserId) {
    throw new AppError('Cannot delete your own account', 400);
  }

  const admin = await Admin.findByIdAndDelete(id);

  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Admin deleted successfully',
    data: {},
  };

  return res.json(response);
});

// Change Password
export const changeAdminPassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }

  const admin = await Admin.findById(userId).select('+password');

  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  const isPasswordValid = await admin.comparePassword(currentPassword);

  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  admin.password = newPassword;
  await admin.save();

  const response: ApiResponse = {
    success: true,
    message: 'Password changed successfully',
    data: {},
  };

  return res.json(response);
});

