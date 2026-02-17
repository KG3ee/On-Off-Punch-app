import { Role } from "@prisma/client";

export interface AuthUser {
  sub: string;
  role: Role;
  displayName: string;
  username: string;
}
