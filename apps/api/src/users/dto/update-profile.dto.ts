import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  vehicleInfo?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

function isValidPhotoUrl(url: string | undefined): boolean {
  if (!url) return true; // null/empty is allowed (removes photo)
  try {
    const parsed = new URL(url);
    // Only allow http/https schemes to block javascript:/data: URIs
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    // Must have a hostname
    if (!parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

export class UpdateProfilePhotoDto {
  @IsOptional()
  @IsString()
  photoUrl?: string;

  /**
   * Reject javascript:, data:, and other non-http(s) URL schemes to
   * prevent stored XSS via profile image tags rendered by the browser.
   */
  static isValid(value: string | undefined): boolean {
    return isValidPhotoUrl(value);
  }
}
