import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Download, 
  CalendarIcon,
  Loader2,
  TrendingUp
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

interface AttendanceRecord {
  id: string;
  check_in_time: string;
  date: string;
  status: string;
  confidence_score: number;
  employees: {
    name: string;
    employee_id: string;
    department: string;
  };
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export default function Reports() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchAttendance();
  }, [dateRange]);

  const fetchAttendance = async () => {
    if (!dateRange.from || !dateRange.to) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*, employees(name, employee_id, department)')
        .gte('date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('date', format(dateRange.to, 'yyyy-MM-dd'))
        .order('check_in_time', { ascending: false });

      if (error) throw error;

      setAttendance((data || []) as AttendanceRecord[]);
    } catch (error) {
      console.error('Error fetching attendance:', error);
      toast({
        title: 'Error',
        description: 'Failed to load attendance records.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    if (attendance.length === 0) {
      toast({
        title: 'No data',
        description: 'No attendance records to export.',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);

    try {
      const data = attendance.map((record) => ({
        'Employee Name': record.employees.name,
        'Employee ID': record.employees.employee_id,
        'Department': record.employees.department,
        'Date': format(new Date(record.date), 'MMM d, yyyy'),
        'Check-in Time': format(new Date(record.check_in_time), 'h:mm:ss a'),
        'Status': record.status.charAt(0).toUpperCase() + record.status.slice(1),
        'Confidence Score': `${record.confidence_score}%`,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

      // Auto-size columns
      const colWidths = Object.keys(data[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...data.map((row) => String((row as Record<string, unknown>)[key]).length)),
      }));
      ws['!cols'] = colWidths;

      const fileName = `attendance_${format(dateRange.from!, 'yyyy-MM-dd')}_to_${format(
        dateRange.to!,
        'yyyy-MM-dd'
      )}.xlsx`;

      XLSX.writeFile(wb, fileName);

      toast({
        title: 'Export successful',
        description: `Attendance report saved as ${fileName}`,
      });
    } catch (error) {
      console.error('Error exporting:', error);
      toast({
        title: 'Export failed',
        description: 'Failed to export attendance records.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const quickFilters = [
    { label: 'Today', onClick: () => setDateRange({ from: new Date(), to: new Date() }) },
    { label: 'Last 7 days', onClick: () => setDateRange({ from: subDays(new Date(), 7), to: new Date() }) },
    { label: 'This Month', onClick: () => setDateRange({ from: startOfMonth(new Date()), to: new Date() }) },
    { label: 'Last Month', onClick: () => {
      const lastMonth = subDays(startOfMonth(new Date()), 1);
      setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
    }},
  ];

  const stats = {
    total: attendance.length,
    present: attendance.filter((a) => a.status === 'present').length,
    late: attendance.filter((a) => a.status === 'late').length,
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            View and export attendance reports
          </p>
        </div>
        <Button onClick={exportToExcel} disabled={isExporting || attendance.length === 0}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export to Excel
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-2">
              {quickFilters.map((filter) => (
                <Button
                  key={filter.label}
                  variant="outline"
                  size="sm"
                  onClick={filter.onClick}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? format(dateRange.from, 'MMM d, yyyy') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange((prev) => ({ ...prev, from: date }))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? format(dateRange.to, 'MMM d, yyyy') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange((prev) => ({ ...prev, to: date }))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Records</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">On Time</p>
                <p className="text-2xl font-bold text-foreground">{stats.present}</p>
              </div>
              <div className="p-3 rounded-xl bg-success/10">
                <FileText className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Late Arrivals</p>
                <p className="text-2xl font-bold text-foreground">{stats.late}</p>
              </div>
              <div className="p-3 rounded-xl bg-warning/10">
                <FileText className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Attendance Records
          </CardTitle>
          <CardDescription>
            {dateRange.from && dateRange.to && (
              <>
                {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : attendance.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No records found</p>
              <p className="text-sm">Try adjusting the date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendance.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-semibold text-primary">
                              {record.employees.name.charAt(0)}
                            </span>
                          </div>
                          <span className="font-medium">{record.employees.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {record.employees.employee_id}
                      </TableCell>
                      <TableCell>{record.employees.department}</TableCell>
                      <TableCell>{format(new Date(record.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{format(new Date(record.check_in_time), 'h:mm a')}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            record.status === 'present'
                              ? 'bg-success/10 text-success border-success/20'
                              : record.status === 'late'
                              ? 'bg-warning/10 text-warning border-warning/20'
                              : ''
                          }
                        >
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{record.confidence_score}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
