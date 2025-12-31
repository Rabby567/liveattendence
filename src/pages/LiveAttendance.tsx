import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadFaceApiModels, detectFace, findBestMatch } from '@/lib/faceApi';
import { getFaceEncodings } from '@/lib/indexedDb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Camera, 
  Loader2, 
  Check, 
  AlertCircle, 
  UserCheck,
  Clock,
  ScanFace
} from 'lucide-react';
import { format } from 'date-fns';

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  department: string;
}

interface RecentAttendance {
  employee: Employee;
  time: Date;
  confidence: number;
}

const MATCH_THRESHOLD = 0.5; // Lower is better for euclidean distance

export default function LiveAttendance() {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMatch, setLastMatch] = useState<{ employee: Employee; confidence: number } | null>(null);
  const [recentAttendance, setRecentAttendance] = useState<RecentAttendance[]>([]);
  const [markedToday, setMarkedToday] = useState<Set<string>>(new Set());
  const [storedFaces, setStoredFaces] = useState<{ employeeId: string; descriptors: number[][] }[]>([]);
  const [employees, setEmployees] = useState<Map<string, Employee>>(new Map());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const processLockRef = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    initializeAttendance();
    return () => stopCamera();
  }, []);

  const initializeAttendance = async () => {
    try {
      // Load face-api models
      await loadFaceApiModels();
      setIsModelLoading(false);

      // Load stored face encodings
      const encodings = await getFaceEncodings();
      setStoredFaces(encodings.map((e) => ({ employeeId: e.employeeId, descriptors: e.descriptors })));

      // Load employees
      const { data: empData } = await supabase
        .from('employees')
        .select('id, name, employee_id, department')
        .eq('is_active', true);

      if (empData) {
        const empMap = new Map<string, Employee>();
        empData.forEach((emp) => empMap.set(emp.id, emp));
        setEmployees(empMap);
      }

      // Load today's attendance
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('employee_id')
        .eq('date', today);

      if (attendanceData) {
        setMarkedToday(new Set(attendanceData.map((a) => a.employee_id)));
      }
    } catch (error) {
      console.error('Error initializing attendance:', error);
      toast({
        title: 'Initialization error',
        description: 'Failed to load attendance data. Please refresh.',
        variant: 'destructive',
      });
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        detectAndMatch();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera access denied',
        description: 'Please allow camera access for attendance.',
        variant: 'destructive',
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setIsCameraActive(false);
    setFaceDetected(false);
    setLastMatch(null);
  };

  const detectAndMatch = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(detectAndMatch);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const detection = await detectFace(video);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      setFaceDetected(true);
      const box = detection.detection.box;
      
      // Draw bounding box
      ctx.strokeStyle = 'hsl(217, 91%, 50%)';
      ctx.lineWidth = 4;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Try to match face (with rate limiting)
      if (!processLockRef.current && storedFaces.length > 0) {
        processLockRef.current = true;
        
        const match = findBestMatch(detection.descriptor, storedFaces);
        
        if (match && match.distance < MATCH_THRESHOLD) {
          const employee = employees.get(match.employeeId);
          
          if (employee) {
            const confidence = Math.round((1 - match.distance) * 100);
            setLastMatch({ employee, confidence });

            // Draw match info on canvas
            ctx.fillStyle = 'hsl(142, 76%, 36%)';
            ctx.fillRect(box.x, box.y - 40, box.width, 35);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.fillText(`${employee.name} (${confidence}%)`, box.x + 10, box.y - 15);

            // Mark attendance if not already marked
            if (!markedToday.has(employee.id)) {
              await markAttendance(employee, confidence);
            }
          }
        } else {
          setLastMatch(null);
        }

        setTimeout(() => {
          processLockRef.current = false;
        }, 500); // Process every 500ms
      }
    } else {
      setFaceDetected(false);
      setLastMatch(null);
    }

    animationRef.current = requestAnimationFrame(detectAndMatch);
  }, [storedFaces, employees, markedToday]);

  const markAttendance = async (employee: Employee, confidence: number) => {
    try {
      setIsProcessing(true);

      const now = new Date();
      const workStartTime = new Date();
      workStartTime.setHours(9, 0, 0, 0); // 9:00 AM

      const status = now > workStartTime ? 'late' : 'present';

      const { error } = await supabase.from('attendance').insert({
        employee_id: employee.id,
        check_in_time: now.toISOString(),
        date: format(now, 'yyyy-MM-dd'),
        confidence_score: confidence,
        status,
      });

      if (error) throw error;

      setMarkedToday((prev) => new Set([...prev, employee.id]));
      setRecentAttendance((prev) => [
        { employee, time: now, confidence },
        ...prev.slice(0, 9),
      ]);

      toast({
        title: 'Attendance Marked!',
        description: `${employee.name} checked in at ${format(now, 'h:mm a')}`,
      });
    } catch (error) {
      console.error('Error marking attendance:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark attendance. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Live Attendance</h1>
        <p className="text-muted-foreground mt-1">
          Automatic face recognition attendance system
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera View */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5" />
              Camera Feed
            </CardTitle>
            <CardDescription>
              {storedFaces.length === 0
                ? 'No registered faces found. Register employees first.'
                : `${storedFaces.length} registered faces loaded`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isModelLoading ? (
              <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading face recognition models...</p>
                </div>
              </div>
            ) : !isCameraActive ? (
              <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                <Button onClick={startCamera} size="lg" disabled={storedFaces.length === 0}>
                  <Camera className="h-5 w-5 mr-2" />
                  Start Attendance
                </Button>
              </div>
            ) : (
              <div className="relative aspect-video bg-muted rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                />
                
                {/* Status indicators */}
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                    faceDetected ? 'bg-success/90' : 'bg-muted/90'
                  }`}>
                    {faceDetected ? (
                      <Check className="h-4 w-4 text-success-foreground" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-primary-foreground">
                      {faceDetected ? 'Face detected' : 'Scanning...'}
                    </span>
                  </div>
                  
                  {isProcessing && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/90">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                      <span className="text-sm font-medium text-primary-foreground">Processing...</span>
                    </div>
                  )}
                </div>

                {/* Match info */}
                {lastMatch && (
                  <div className="absolute bottom-4 left-4 right-4 bg-card/95 backdrop-blur rounded-lg p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                      <UserCheck className="h-6 w-6 text-success" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{lastMatch.employee.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {lastMatch.employee.department} • {lastMatch.employee.employee_id}
                      </p>
                    </div>
                    <Badge className="bg-success text-success-foreground">
                      {lastMatch.confidence}% match
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {isCameraActive && (
              <div className="mt-4 flex justify-center">
                <Button variant="destructive" onClick={stopCamera}>
                  Stop Camera
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Attendance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Check-ins
            </CardTitle>
            <CardDescription>
              Live attendance feed
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentAttendance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No check-ins yet</p>
                <p className="text-sm">Start the camera to begin</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {recentAttendance.map((record, index) => (
                  <div
                    key={`${record.employee.id}-${index}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 animate-slide-up"
                  >
                    <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                      <Check className="h-5 w-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {record.employee.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(record.time, 'h:mm:ss a')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {record.confidence}%
                    </Badge>
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
