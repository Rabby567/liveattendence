import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { loadFaceApiModels, detectFace, faceapi } from '@/lib/faceApi';
import { saveFaceEncoding } from '@/lib/indexedDb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Camera, 
  Loader2, 
  Check, 
  AlertCircle, 
  User,
  Building,
  BadgeCheck,
  ScanFace
} from 'lucide-react';

const DEPARTMENTS = [
  'Engineering',
  'Marketing',
  'Sales',
  'Human Resources',
  'Finance',
  'Operations',
  'IT',
  'Design',
];

const REQUIRED_CAPTURES = 5;

export default function FaceRegistration() {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturedDescriptors, setCapturedDescriptors] = useState<Float32Array[]>([]);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    department: '',
    email: '',
    phone: '',
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadFaceApiModels()
      .then(() => setIsModelLoading(false))
      .catch((error) => {
        console.error('Failed to load face-api models:', error);
        toast({
          title: 'Error loading models',
          description: 'Failed to load face recognition models. Please refresh the page.',
          variant: 'destructive',
        });
      });

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        streamRef.current = stream;
        
        // Wait for video metadata to load
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Video failed to load'));
          setTimeout(() => resolve(), 3000);
        });
        
        // Explicitly play the video
        await video.play();
        
        setIsCameraActive(true);
        detectFaces();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera access denied',
        description: 'Please allow camera access to register faces.',
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
  };

  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const detection = await detectFace(video);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      setFaceDetected(true);
      const box = detection.detection.box;
      
      ctx.strokeStyle = 'hsl(217, 91%, 50%)';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // Draw face landmarks
      const landmarks = detection.landmarks;
      ctx.fillStyle = 'hsl(217, 91%, 60%)';
      landmarks.positions.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    } else {
      setFaceDetected(false);
    }

    animationRef.current = requestAnimationFrame(detectFaces);
  }, []);

  const captureFrame = async () => {
    if (!videoRef.current || !faceDetected) return;

    const detection = await detectFace(videoRef.current);
    
    if (detection) {
      // Capture image from video
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImages((prev) => [...prev, imageDataUrl]);
      }
      
      setCapturedDescriptors((prev) => [...prev, detection.descriptor]);
      
      toast({
        title: `Captured ${capturedDescriptors.length + 1}/${REQUIRED_CAPTURES}`,
        description: 'Face captured successfully!',
      });
    } else {
      toast({
        title: 'No face detected',
        description: 'Please position your face in the frame.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (capturedDescriptors.length < REQUIRED_CAPTURES) {
      toast({
        title: 'Insufficient captures',
        description: `Please capture at least ${REQUIRED_CAPTURES} face images.`,
        variant: 'destructive',
      });
      return;
    }

    if (!formData.name || !formData.employeeId || !formData.department) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Check if employee ID already exists
      const { data: existing } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_id', formData.employeeId)
        .single();

      if (existing) {
        toast({
          title: 'Employee ID exists',
          description: 'This employee ID is already registered.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      // Insert employee record
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .insert({
          name: formData.name,
          employee_id: formData.employeeId,
          department: formData.department,
          email: formData.email || null,
          phone: formData.phone || null,
        })
        .select()
        .single();

      if (employeeError) throw employeeError;

      // Save face encoding to IndexedDB
      await saveFaceEncoding(employee.id, capturedDescriptors);

      toast({
        title: 'Registration successful!',
        description: `${formData.name} has been registered.`,
      });

      stopCamera();
      navigate('/employees');
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: 'Registration failed',
        description: 'An error occurred during registration. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetCaptures = () => {
    setCapturedDescriptors([]);
    setCapturedImages([]);
    toast({
      title: 'Captures reset',
      description: 'You can now capture new face images.',
    });
  };

  const progress = (capturedDescriptors.length / REQUIRED_CAPTURES) * 100;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Face Registration</h1>
        <p className="text-muted-foreground mt-1">
          Register a new employee with face recognition
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5" />
              Face Capture
            </CardTitle>
            <CardDescription>
              Position your face in the camera and capture {REQUIRED_CAPTURES} images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isModelLoading ? (
              <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading face recognition models...</p>
                </div>
              </div>
            ) : !isCameraActive ? (
              <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                <Button onClick={startCamera} size="lg">
                  <Camera className="h-5 w-5 mr-2" />
                  Start Camera
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
                
                {/* Face detection indicator */}
                <div className="absolute top-4 left-4">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                    faceDetected ? 'bg-success/90' : 'bg-destructive/90'
                  }`}>
                    {faceDetected ? (
                      <Check className="h-4 w-4 text-success-foreground" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive-foreground" />
                    )}
                    <span className="text-sm font-medium text-primary-foreground">
                      {faceDetected ? 'Face detected' : 'No face detected'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Capture Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Capture Progress</span>
                <span className="font-medium">
                  {capturedDescriptors.length}/{REQUIRED_CAPTURES}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Capture Controls */}
            <div className="flex gap-3">
              <Button
                onClick={captureFrame}
                disabled={!faceDetected || capturedDescriptors.length >= REQUIRED_CAPTURES}
                className="flex-1"
              >
                <Camera className="h-4 w-4 mr-2" />
                Capture ({capturedDescriptors.length}/{REQUIRED_CAPTURES})
              </Button>
              <Button variant="outline" onClick={resetCaptures} disabled={capturedDescriptors.length === 0}>
                Reset
              </Button>
              {isCameraActive && (
                <Button variant="destructive" onClick={stopCamera}>
                  Stop
                </Button>
              )}
            </div>

            {/* Captured Thumbnails */}
            {capturedImages.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Captured Images</span>
                <div className="flex gap-2 flex-wrap">
                  {capturedImages.map((img, index) => (
                    <div
                      key={index}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-primary/20 shadow-sm"
                    >
                      <img
                        src={img}
                        alt={`Capture ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-xs text-center py-0.5">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Employee Details
            </CardTitle>
            <CardDescription>
              Enter the employee information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeId">Employee ID *</Label>
                <div className="relative">
                  <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="employeeId"
                    placeholder="EMP001"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Select
                  value={formData.department}
                  onValueChange={(value) => setFormData({ ...formData, department: value })}
                >
                  <SelectTrigger>
                    <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isProcessing || capturedDescriptors.length < REQUIRED_CAPTURES}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Register Employee
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
