import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Delete,
  BadRequestException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CsrfGuard } from "../common/guards/csrf.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { CreateUserDto } from "./dto/create-user.dto";
import { ChangePasswordDto, UpdateProfileDto, UpdateProfilePhotoDto } from "./dto/update-profile.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get("me")
  async getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getPublicOrThrow(user.sub);
  }

  @Patch("me/profile")
  async updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Post("me/profile-photo")
  async updateProfilePhoto(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfilePhotoDto) {
    if (dto.photoUrl !== undefined && !UpdateProfilePhotoDto.isValid(dto.photoUrl)) {
      throw new BadRequestException("photoUrl must be a valid http(s) URL");
    }
    return this.usersService.updateProfilePhoto(user.sub, dto.photoUrl ?? null);
  }

  @Post("me/change-password")
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
    return { success: true };
  }

  @Roles(Role.ADMIN)
  @Get("admin/users")
  async listUsers() {
    return this.usersService.listUsers();
  }

  @Roles(Role.ADMIN)
  @Post("admin/users")
  async createUser(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Roles(Role.ADMIN)
  @Patch("admin/users/:id")
  async updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }
  @Roles(Role.ADMIN)
  @Delete("admin/users/:id")
  async deleteUser(@Param("id") id: string) {
    await this.usersService.deleteUser(id);
    return { success: true };
  }
}
