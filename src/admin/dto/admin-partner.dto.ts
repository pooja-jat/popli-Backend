import { IsString, IsEmail, IsOptional, IsEnum, IsObject, MinLength } from 'class-validator';

export enum AdminPartnerStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class CreateAdminPartnerDto {
  @IsString()
  fullName: string;

  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  designation: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsEnum(AdminPartnerStatus)
  status: AdminPartnerStatus;

  @IsObject()
  permissions: Record<string, boolean>;
}

export class UpdateAdminPartnerDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(AdminPartnerStatus)
  status?: AdminPartnerStatus;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;
}

export class ResetPartnerPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}