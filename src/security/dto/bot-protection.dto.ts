import { IsOptional, IsString } from 'class-validator';

export class BotProtectionActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}   