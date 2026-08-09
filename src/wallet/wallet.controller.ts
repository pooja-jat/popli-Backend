import { Controller, Get, Post, Body, UseGuards, Req, Headers } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { RechargeDto, WithdrawDto, CreateOrderDto, VerifyPaymentDto } from './dto/wallet.dto';
import type { Request } from 'express';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('recharge/webhook')
  @ApiOperation({ summary: 'Razorpay webhook' })
  razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    return this.walletService.handleRazorpayWebhook(req.rawBody!, signature);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Get wallet balance and transactions' })
  getBalance(@Req() req: any) {
    return this.walletService.getBalance(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('recharge/create-order')
  @ApiOperation({ summary: 'Create Razorpay order' })
  createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    return this.walletService.createRazorpayOrder(req.user.id, dto.packageId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('recharge/verify')
  @ApiOperation({ summary: 'Verify Razorpay payment and credit coins' })
  verifyPayment(@Req() req: any, @Body() dto: VerifyPaymentDto) {
    return this.walletService.verifyAndCreditCoins(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('payments')
  @ApiOperation({ summary: 'Get payment history' })
  getPayments(@Req() req: any) {
    return this.walletService.getPaymentHistory(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('withdraw')
  @ApiOperation({ summary: 'Request withdrawal to UPI' })
  withdraw(@Req() req: any, @Body() dto: WithdrawDto) {
    return this.walletService.withdraw(req.user.id, dto);
  }


}