export interface CreateStudentRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  dateOfBirth: Date;
  gender: string;
  // Either pass an explicit sectionId, OR a classId + sectionName (the section
  // is resolved/created under that class).
  sectionId?: string;
  classId?: string;
  sectionName?: string;
  rollNumber: string;
  bloodGroup?: string;
  caste?: string;
  religion?: string;
  motherTongue?: string;
  aadharNumber?: string;
  admissionNumber?: string;
  photo?: string;
}

export interface UpdateStudentRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  dateOfBirth?: Date;
  gender?: string;
  sectionId?: string;
  rollNumber?: string;
  bloodGroup?: string;
  caste?: string;
  religion?: string;
  motherTongue?: string;
  aadharNumber?: string;
  photo?: string;
}

export interface UploadStudentDocumentRequest {
  type: string;
  fileUrl: string;
}

export interface BulkImportStudentRequest {
  csvData: string;
}
