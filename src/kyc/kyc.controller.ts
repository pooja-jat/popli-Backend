import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KycService } from './kyc.service';
import {
  SubmitKycDto,
  VerifyPanDto,
  VerifyAadharDto,
  VerifyAadharOtpDto,
  VerifyUpiDto,
  VerifyBankDto,
} from './dto/kyc.dto';

@ApiTags('kyc')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current KYC status' })
  getKycStatus(@Req() req: any) {
    return this.kycService.getKycStatus(req.user.id);
  }

  @Post('pan/verify')
  @ApiOperation({ summary: 'Verify PAN card via SurePass' })
  verifyPan(@Req() req: any, @Body() dto: VerifyPanDto) {
    return this.kycService.verifyPan(req.user.id, dto);
  }

  @Post('aadhaar/initiate-otp')
  @ApiOperation({ summary: 'Send OTP to Aadhaar-linked mobile' })
  initiateAadharOtp(@Req() req: any, @Body() dto: VerifyAadharDto) {
    return this.kycService.initiateAadharOtp(req.user.id, dto);
  }

  @Post('aadhaar/verify-otp')
  @ApiOperation({ summary: 'Verify Aadhaar OTP' })
  verifyAadharOtp(@Req() req: any, @Body() dto: VerifyAadharOtpDto) {
    return this.kycService.verifyAadharOtp(req.user.id, dto);
  }

  @Post('upi/verify')
  @ApiOperation({ summary: 'Verify UPI ID via SurePass' })
  verifyUpi(@Req() req: any, @Body() dto: VerifyUpiDto) {
    return this.kycService.verifyUpi(req.user.id, dto);
  }

  @Post('bank/verify')
  @ApiOperation({ summary: 'Verify bank account via SurePass' })
  verifyBank(@Req() req: any, @Body() dto: VerifyBankDto) {
    return this.kycService.verifyBank(req.user.id, dto);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Final KYC submission after all verifications' })
  submitKyc(@Req() req: any, @Body() dto: SubmitKycDto) {
    return this.kycService.submitKyc(req.user.id, dto);
  }
}