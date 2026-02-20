export type UserRole = 'ADMIN' | 'EMPLOYEE';

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string | null;
  role: UserRole;
  isDriver?: boolean;
  driverStatus?: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  mustChangePassword: boolean;
  teamId?: string | null;
  team?: {
    id: string;
    name: string;
  } | null;
}
