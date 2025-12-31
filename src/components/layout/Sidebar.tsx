import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  UserPlus, 
  Camera, 
  Users, 
  FileText, 
  LogOut,
  ScanFace
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Register Face', href: '/register', icon: UserPlus },
  { name: 'Live Attendance', href: '/attendance', icon: Camera },
  { name: 'Employees', href: '/employees', icon: Users },
  { name: 'Reports', href: '/reports', icon: FileText },
];

export function Sidebar() {
  const location = useLocation();
  const { signOut, user, isAdmin } = useAuth();

  return (
    <div className="flex flex-col h-full w-64 bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="p-2 rounded-lg gradient-primary">
          <ScanFace className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold text-foreground">FaceAttend</h1>
          <p className="text-xs text-muted-foreground">Attendance System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.email}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? 'Administrator' : 'User'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
