export type UserRole = 'ADMIN' | 'EMPLOYEE' | 'DRIVER' | 'LEADER';

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string | null;
  role: UserRole;
  driverStatus?: 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';
  mustChangePassword: boolean;
  teamId?: string | null;
  team?: {
    id: string;
    name: string;
  } | null;
}
