export type Modality = 'RFID' | 'FINGERPRINT' | 'FACE';
export type Direction = 'IN' | 'OUT';

export interface RegisterDeviceRequest {
  name: string;
  modality: Modality;
  serialNumber?: string;
  ipAddress?: string;
  location?: string;
  lateAfterMinutes?: number;
}

export interface UpdateDeviceRequest {
  name?: string;
  serialNumber?: string;
  ipAddress?: string;
  location?: string;
  lateAfterMinutes?: number;
  isActive?: boolean;
}

export interface EnrollStudentRequest {
  studentId: string;
  modality: Modality;
  deviceUserId?: string;
  cardNumber?: string;
  deviceId?: string;
}

/**
 * Normalized punch extracted from whatever raw payload a device sends.
 * The ingest layer maps vendor formats (Hikvision ISAPI, generic JSON) into this.
 */
export interface NormalizedPunch {
  deviceUserId?: string;
  cardNumber?: string;
  eventTime: Date;
  direction: Direction;
  serialNumber?: string;
}

export interface IngestResult {
  matched: boolean;
  studentId?: string;
  status?: string;
  punchId: string;
}
