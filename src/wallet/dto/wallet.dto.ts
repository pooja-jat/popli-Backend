import { IsNumber, IsString, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechargeDto {
  @ApiProperty()
  @IsNumber()
  amount: number = 0;

  @ApiProperty()
  @IsNumber()
  coins: number = 0;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  paymentReference: string = '';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  packageId?: string;
}

export class WithdrawDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  amount: number = 0;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  upiId?: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  packageId: string = '';
}

export class VerifyPaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpaySignature: string = '';
}