import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubmitKycDto,
  VerifyPanDto,
  VerifyAadharDto,
  VerifyAadharOtpDto,
  VerifyUpiDto,
  VerifyBankDto,
} from './dto/kyc.dto';
import axios from 'axios';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly cashfreeClientId = process.env.CASHFREE_VERIFICATION_CLIENT_ID!;
  private readonly cashfreeClientSecret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET!;
  private readonly cashfreeBase = process.env.CASHFREE_ENV === 'sandbox' || process.env.CASHFREE_ENV === 'test' 
    ? 'https://sandbox.cashfree.com/verification' 
    : 'https://api.cashfree.com/verification';

  constructor(private prisma: PrismaService) {}

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private namesMatch(nameA: string, nameB: string): boolean {
    const a = this.normalizeName(nameA);
    const b = this.normalizeName(nameB);
    if (a === b) return true;
    const wordsA = a.split(' ');
    const wordsB = b.split(' ');
    const commonWords = wordsA.filter((w) => wordsB.includes(w) && w.length > 1);
    const matchRatio = commonWords.length / Math.max(wordsA.length, wordsB.length);
    return matchRatio >= 0.6;
  }

  async getKycStatus(userId: string) {
    let kyc = await this.prisma.kYCRecord.findUnique({ where: { userId } });
    if (!kyc) {
      kyc = await this.prisma.kYCRecord.create({
        data: { userId, fullName: '', dob: '', status: 'NOT_SUBMITTED' },
      });
    }
    return {
      status: kyc.status,
      isPanVerified: kyc.isPanVerified,
      isAadharVerified: kyc.isAadharVerified,
      isUpiLinked: kyc.isUpiLinked,
      isBankLinked: kyc.isBankLinked,
      fullName: kyc.fullName,
      dob: kyc.dob,
      address: kyc.address,
      upiId: kyc.upiId,
      accountType: kyc.accountType,
      rejectionReason: kyc.rejectionReason,
    };
  }

  async verifyPan(userId: string, dto: VerifyPanDto) {
    const pan = dto.panNumber.trim().toUpperCase();

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      throw new BadRequestException('Invalid PAN format.');
    }

    const existingVerified = await this.prisma.kYCRecord.findFirst({
      where: { panNumber: pan, isPanVerified: true },
    });
    if (existingVerified && existingVerified.userId !== userId) {
      throw new BadRequestException(
        'This PAN is already linked to another account.',
      );
    }

    let providerData: any;
    try {
      const response = await axios.post(
        `${this.cashfreeBase}/pan`,
        { pan: pan, name: dto.fullName },
        {
          headers: {
            'x-client-id': this.cashfreeClientId,
            'x-client-secret': this.cashfreeClientSecret,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
      providerData = response.data;
    } catch (err: any) {
      this.logger.error('Cashfree PAN API error', err?.response?.data);
      throw new InternalServerErrorException(
        'PAN verification service unavailable. Please try again.',
      );
    }

    if (!providerData || providerData.valid === false) {
      throw new BadRequestException('PAN not found or invalid.');
    }

    const panData = providerData;
    const providerName: string = panData.registered_name || panData.name_provided || panData.name || '';

    if (!providerName) {
      throw new BadRequestException('Could not fetch PAN holder name.');
    }

    if (!this.namesMatch(dto.fullName, providerName)) {
      throw new BadRequestException(
        `Name mismatch. PAN belongs to "${providerName}". Please enter your name exactly as on your PAN card.`,
      );
    }


    await this.prisma.kYCRecord.upsert({
      where: { userId },
      update: {
        panNumber: pan,
        panNameFromProvider: providerName,
        isPanVerified: true,
        panVerifiedAt: new Date(),
        panVerificationMeta: panData,
        fullName: dto.fullName,
      },
      create: {
        userId,
        fullName: dto.fullName,
        dob: '',
        panNumber: pan,
        panNameFromProvider: providerName,
        isPanVerified: true,
        panVerifiedAt: new Date(),
        panVerificationMeta: panData,
        status: 'PENDING',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_PAN_VERIFIED',
        entityType: 'KYCRecord',
        entityId: userId,
        newValue: { pan: pan.slice(0, 5) + '*****', providerName },
      },
    });

    return { success: true, message: 'PAN verified successfully.', nameOnPan: providerName };
  }

  async initiateAadharOtp(userId: string, dto: VerifyAadharDto) {
    const aadhar = dto.aadharNumber.replace(/\s/g, '');

    if (!/^[0-9]{12}$/.test(aadhar)) {
      throw new BadRequestException('Invalid Aadhaar number format.');
    }

    if (!this.verhoeffCheck(aadhar)) {
      throw new BadRequestException(
        'Invalid Aadhaar number. Please check and re-enter.',
      );
    }

    const existingVerified = await this.prisma.kYCRecord.findFirst({
      where: { aadharNumber: aadhar, isAadharVerified: true },
    });
    if (existingVerified && existingVerified.userId !== userId) {
      throw new BadRequestException(
        'This Aadhaar is already linked to another account.',
      );
    }

    let providerData: any;
    if (process.env.CASHFREE_ENV === 'sandbox' || process.env.CASHFREE_ENV === 'test') {
      providerData = { ref_id: 'mock_ref_id_123456' };
    } else {
      try {
        const response = await axios.post(
          `${this.cashfreeBase}/offline-aadhaar/otp`,
          { aadhaar_number: aadhar },
          {
            headers: {
              'x-client-id': this.cashfreeClientId,
              'x-client-secret': this.cashfreeClientSecret,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        providerData = response.data;
      } catch (err: any) {
        this.logger.error('Cashfree Aadhaar OTP error', err?.response?.data);
        throw new InternalServerErrorException(
          'Aadhaar verification service unavailable. Please try again.',
        );
      }
    }

    if (!providerData?.ref_id) {
      throw new BadRequestException(
        'Could not initiate Aadhaar OTP. Please verify your Aadhaar number.',
      );
    }

    await this.prisma.kYCRecord.upsert({
      where: { userId },
      update: { aadharNumber: aadhar, aadharRefId: providerData.ref_id },
      create: {
        userId,
        fullName: '',
        dob: '',
        aadharNumber: aadhar,
        aadharRefId: providerData.ref_id,
        status: 'PENDING',
      },
    });

    return {
      success: true,
      refId: providerData.ref_id,
      message: 'OTP sent to your Aadhaar-linked mobile number.',
    };
  }

  async verifyAadharOtp(userId: string, dto: VerifyAadharOtpDto) {
    const kyc = await this.prisma.kYCRecord.findUnique({ where: { userId } });
    if (!kyc?.aadharRefId) {
      throw new BadRequestException(
        'No Aadhaar OTP session found. Please restart verification.',
      );
    }

    if (kyc.aadharRefId !== dto.refId) {
      throw new BadRequestException('Invalid session. Please restart Aadhaar verification.');
    }

    let providerData: any;
    if (process.env.CASHFREE_ENV === 'sandbox' || process.env.CASHFREE_ENV === 'test') {
      providerData = {
        valid: true,
        care_of: 'C/O Dummy',
        address: 'Dummy Address',
        dob: '01-01-1990',
        gender: 'M',
        split_address: {
          country: 'India',
          dist: 'New Delhi',
          state: 'Delhi',
          po: 'New Delhi',
          loc: 'Connaught Place',
          vtc: 'New Delhi',
          subdist: 'New Delhi',
          street: 'Main Road',
          house: '123',
          landmark: 'Near Plaza'
        }
      };
    } else {
      try {
        const response = await axios.post(
          `${this.cashfreeBase}/offline-aadhaar/verify`,
          { ref_id: dto.refId, otp: dto.otp },
          {
            headers: {
              'x-client-id': this.cashfreeClientId,
              'x-client-secret': this.cashfreeClientSecret,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        providerData = response.data;
      } catch (err: any) {
        this.logger.error('Cashfree Aadhaar Verify OTP error', err?.response?.data);
        throw new InternalServerErrorException(
          'Failed to verify Aadhaar OTP. Please try again.',
        );
      }
    }

    if (!providerData || providerData.valid === false) {
      throw new BadRequestException('Invalid OTP or Verification Failed. Please try again.');
    }

    const aadharData = providerData;
    const providerName: string = aadharData.name || '';

    if (providerName && !this.namesMatch(dto.fullName, providerName)) {
      throw new BadRequestException(
        `Name mismatch. Aadhaar belongs to "${providerName}". Please ensure your name matches your Aadhaar card.`,
      );
    }

    const panRecord = await this.prisma.kYCRecord.findUnique({ where: { userId } });
    if (
      panRecord?.isPanVerified &&
      panRecord.panNameFromProvider &&
      providerName &&
      !this.namesMatch(panRecord.panNameFromProvider, providerName)
    ) {
      throw new BadRequestException(
        'Name on Aadhaar does not match name on PAN. Documents must belong to the same person.',
      );
    }

    await this.prisma.kYCRecord.update({
      where: { userId },
      data: {
        isAadharVerified: true,
        aadharVerifiedAt: new Date(),
        aadharVerificationMeta: aadharData,
        aadharRefId: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_AADHAAR_VERIFIED',
        entityType: 'KYCRecord',
        entityId: userId,
        newValue: { maskedAadhaar: kyc.aadharNumber?.slice(-4), providerName },
      },
    });

    return { success: true, message: 'Aadhaar verified successfully.' };
  }

  async verifyUpi(userId: string, dto: VerifyUpiDto) {
    const upi = dto.upiId.trim().toLowerCase();

    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi)) {
      throw new BadRequestException('Invalid UPI ID format.');
    }

    let providerData: any;
    if (process.env.CASHFREE_ENV === 'sandbox' || process.env.CASHFREE_ENV === 'test') {
      providerData = { valid: true };
    } else {
      try {
        const response = await axios.post(
          `${this.cashfreeBase}/upi`,
          { vpa: upi },
          {
            headers: {
              'x-client-id': this.cashfreeClientId,
              'x-client-secret': this.cashfreeClientSecret,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        providerData = response.data;
      } catch (err: any) {
        this.logger.error('Cashfree UPI verify error', err?.response?.data);
        throw new InternalServerErrorException(
          'UPI verification service unavailable. Please try again.',
        );
      }
    }

    if (!providerData || providerData.valid === false) {
      throw new BadRequestException(
        'UPI ID not found or invalid. Please check and try again.',
      );
    }

    await this.prisma.kYCRecord.update({
      where: { userId },
      data: { upiId: upi, isUpiLinked: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_UPI_VERIFIED',
        entityType: 'KYCRecord',
        entityId: userId,
        newValue: { upiId: upi },
      },
    });

    return { success: true, message: 'UPI ID verified successfully.' };
  }

  async verifyBank(userId: string, dto: VerifyBankDto) {
    const ifsc = dto.ifscCode.trim().toUpperCase();
    const account = dto.bankAccount.trim();

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      throw new BadRequestException('Invalid IFSC format.');
    }
    if (account.length < 9 || account.length > 18) {
      throw new BadRequestException('Invalid bank account number.');
    }

    let providerData: any;
    if (process.env.CASHFREE_ENV === 'sandbox' || process.env.CASHFREE_ENV === 'test') {
      providerData = {
        account_status: 'VALID',
        name_at_bank: 'Pooja Jat', // Matches the PAN name they tested
      };
    } else {
      try {
        const response = await axios.post(
          `${this.cashfreeBase}/bank-account/sync`,
          { bank_account: account, ifsc: ifsc },
          {
            headers: {
              'x-client-id': this.cashfreeClientId,
              'x-client-secret': this.cashfreeClientSecret,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        providerData = response.data;
      } catch (err: any) {
        this.logger.error('Cashfree bank verify error', err?.response?.data);
        throw new InternalServerErrorException(
          'Bank verification service unavailable. Please try again.',
        );
      }
    }

    if (!providerData || providerData.account_status !== 'VALID') {
      throw new BadRequestException(
        'Bank account not found. Please verify your account number and IFSC code.',
      );
    }

    await this.prisma.kYCRecord.update({
      where: { userId },
      data: { bankAccount: account, ifscCode: ifsc, isBankLinked: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_BANK_VERIFIED',
        entityType: 'KYCRecord',
        entityId: userId,
        newValue: { maskedAccount: account.slice(-4), ifsc },
      },
    });

    return { success: true, message: 'Bank account verified successfully.' };
  }

  async submitKyc(userId: string, dto: SubmitKycDto) {
    const kyc = await this.prisma.kYCRecord.findUnique({ where: { userId } });

    if (kyc?.status === 'APPROVED') {
      throw new BadRequestException('KYC is already approved.');
    }

    if (!kyc?.isPanVerified || !kyc?.isAadharVerified) {
      throw new BadRequestException(
        'PAN and Aadhaar must be verified before submitting KYC.',
      );
    }

    if (!kyc?.isUpiLinked && !kyc?.isBankLinked) {
      throw new BadRequestException(
        'At least one payment method (UPI or Bank) must be verified.',
      );
    }

    const updated = await this.prisma.kYCRecord.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        dob: dto.dob,
        address: dto.address,
        accountType: dto.accountType ?? 'Savings',
        status: 'PENDING',
        submittedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_SUBMITTED',
        entityType: 'KYCRecord',
        entityId: userId,
        newValue: { status: 'PENDING' },
      },
    });

    return { success: true, message: 'KYC submitted for review.', status: updated.status };
  }

  private verhoeffCheck(number: string): boolean {
    const d = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];
    const p = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ];
    const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
    let c = 0;
    const reversed = number.split('').reverse();
    for (let i = 0; i < reversed.length; i++) {
      c = d[c][p[i % 8][parseInt(reversed[i], 10)]];
    }
    return inv[c] === 0;
  }
}