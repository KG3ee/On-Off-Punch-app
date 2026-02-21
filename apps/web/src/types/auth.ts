export type UserRole = 'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF';

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string | null;
  contactNumber?: string | null;
  profilePhotoUrl?: string | null;
  role: UserRole;
  driverStatus?: 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';
  mustChangePassword: boolean;
  teamId?: string | null;
  vehicleInfo?: string | null;
  createdAt?: string;
  team?: {
    id: string;
    name: string;
  } | null;
}
