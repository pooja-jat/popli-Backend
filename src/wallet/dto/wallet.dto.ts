import { IsNumber, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechargeDto {
  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsNumber()
  coins: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  paymentReference: string;

  @ApiProperty({ required: false })
  @IsString()
  packageId?: string;
}
export class WithdrawDto {
  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  upiId: string;
}
