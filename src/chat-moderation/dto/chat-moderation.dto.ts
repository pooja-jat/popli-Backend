import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ChatActionType, ChatFlagStatus, ChatFlagSeverity, ChatFlagType } from '@prisma/client';

export class FlagMessageDto {
  @IsString() chatId: string;
  @IsOptional() @IsString() messageId?: string;
  @IsEnum(ChatFlagType) flagType: ChatFlagType;
  @IsString() reason: string;
}

export class ModerationActionDto {
  @IsEnum(ChatActionType) action: ChatActionType;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() targetUserId?: string;
}

export class GetFlagsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ChatFlagStatus) status?: ChatFlagStatus;
  @IsOptional() @IsEnum(ChatFlagSeverity) severity?: ChatFlagSeverity;
  @IsOptional() @IsEnum(ChatFlagType) flagType?: ChatFlagType;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @Transform(({ value }) => parseInt(value)) page?: number;
  @IsOptional() @Transform(({ value }) => parseInt(value)) limit?: number;
}