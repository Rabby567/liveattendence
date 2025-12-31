import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface FaceEncoding {
  id: string;
  employeeId: string;
  descriptors: number[][];
  createdAt: Date;
}

interface AttendanceDB extends DBSchema {
  faceEncodings: {
    key: string;
    value: FaceEncoding;
    indexes: { 'by-employee': string };
  };
}

let dbInstance: IDBPDatabase<AttendanceDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<AttendanceDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AttendanceDB>('attendance-db', 1, {
    upgrade(db) {
      const store = db.createObjectStore('faceEncodings', { keyPath: 'id' });
      store.createIndex('by-employee', 'employeeId');
    },
  });

  return dbInstance;
}

export async function saveFaceEncoding(employeeId: string, descriptors: Float32Array[]): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  
  await db.put('faceEncodings', {
    id,
    employeeId,
    descriptors: descriptors.map(d => Array.from(d)),
    createdAt: new Date(),
  });

  return id;
}

export async function getFaceEncodings(): Promise<FaceEncoding[]> {
  const db = await getDB();
  return db.getAll('faceEncodings');
}

export async function getFaceEncodingByEmployee(employeeId: string): Promise<FaceEncoding | undefined> {
  const db = await getDB();
  const encodings = await db.getAllFromIndex('faceEncodings', 'by-employee', employeeId);
  return encodings[0];
}

export async function deleteFaceEncoding(employeeId: string): Promise<void> {
  const db = await getDB();
  const encodings = await db.getAllFromIndex('faceEncodings', 'by-employee', employeeId);
  for (const encoding of encodings) {
    await db.delete('faceEncodings', encoding.id);
  }
}

export async function clearAllFaceEncodings(): Promise<void> {
  const db = await getDB();
  await db.clear('faceEncodings');
}
