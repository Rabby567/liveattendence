import * as faceapi from 'face-api.js';

let modelsLoaded = false;

export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return;

  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  modelsLoaded = true;
}

export async function detectFace(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | undefined> {
  const detection = await faceapi
    .detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection;
}

export async function detectAllFaces(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>[]> {
  const detections = await faceapi
    .detectAllFaces(input)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections;
}

export function createFaceMatcher(
  labeledDescriptors: faceapi.LabeledFaceDescriptors[],
  threshold: number = 0.6
): faceapi.FaceMatcher {
  return new faceapi.FaceMatcher(labeledDescriptors, threshold);
}

export function euclideanDistance(arr1: Float32Array, arr2: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += Math.pow(arr1[i] - arr2[i], 2);
  }
  return Math.sqrt(sum);
}

export function findBestMatch(
  descriptor: Float32Array,
  storedDescriptors: { employeeId: string; descriptors: number[][] }[]
): { employeeId: string; distance: number } | null {
  let bestMatch: { employeeId: string; distance: number } | null = null;

  for (const stored of storedDescriptors) {
    for (const storedDesc of stored.descriptors) {
      const distance = euclideanDistance(descriptor, new Float32Array(storedDesc));
      
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          employeeId: stored.employeeId,
          distance,
        };
      }
    }
  }

  return bestMatch;
}

export { faceapi };
