import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKycDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  dob: string = '';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  upiId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ifscCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accountType?: string;
}

export class VerifyPanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  panNumber: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName: string = '';
}

export class VerifyAadharDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  aadharNumber: string = '';
}

export class VerifyAadharOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refId: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otp: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName: string = '';
}

export class VerifyUpiDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  upiId: string = '';
}

export class VerifyBankDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccount: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ifscCode: string = '';
}