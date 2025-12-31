import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Camera, 
  UserPlus, 
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';

interface AttendanceRecord {
  id: string;
  check_in_time: string;
  status: string;
  confidence_score: number;
  employees: {
    name: string;
    department: string;
    employee_id: string;
  };
}

interface Stats {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
  });
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch total employees
      const { count: employeeCount } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Fetch today's attendance
      const { data: todayAttendance } = await supabase
        .from('attendance')
        .select('*, employees(name, department, employee_id)')
        .eq('date', today)
        .order('check_in_time', { ascending: false });

      const presentCount = todayAttendance?.filter(a => a.status === 'present').length || 0;
      const lateCount = todayAttendance?.filter(a => a.status === 'late').length || 0;
      const totalPresent = presentCount + lateCount;

      setStats({
        totalEmployees: employeeCount || 0,
        presentToday: presentCount,
        lateToday: lateCount,
        absentToday: Math.max(0, (employeeCount || 0) - totalPresent),
      });

      setRecentAttendance((todayAttendance || []).slice(0, 5) as AttendanceRecord[]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Employees',
      value: stats.totalEmployees,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Present Today',
      value: stats.presentToday,
      icon: UserCheck,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Late Arrivals',
      value: stats.lateToday,
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Absent Today',
      value: stats.absentToday,
      icon: UserX,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link to="/register">
              <UserPlus className="h-4 w-4 mr-2" />
              Register Face
            </Link>
          </Button>
          <Button asChild>
            <Link to="/attendance">
              <Camera className="h-4 w-4 mr-2" />
              Start Attendance
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="animate-slide-up">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p className="text-3xl font-bold text-foreground mt-2">
                    {isLoading ? '—' : stat.value}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Recent Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/register">
                <span className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Register New Employee
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/attendance">
                <span className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Mark Attendance
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/employees">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Manage Employees
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/reports">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  View Reports
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Attendance */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Check-ins</CardTitle>
              <CardDescription>Today's attendance activity</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/reports">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/4" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentAttendance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No check-ins recorded today</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to="/attendance">Start taking attendance</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentAttendance.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {record.employees.name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {record.employees.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {record.employees.department} • {record.employees.employee_id}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={record.status === 'present' ? 'default' : 'secondary'}
                        className={
                          record.status === 'present'
                            ? 'bg-success text-success-foreground'
                            : record.status === 'late'
                            ? 'bg-warning text-warning-foreground'
                            : ''
                        }
                      >
                        {record.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(record.check_in_time), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
