export type UserRole = 'ADMIN' | 'EMPLOYEE';

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  teamId?: string | null;
  team?: {
    id: string;
    name: string;
  } | null;
}
