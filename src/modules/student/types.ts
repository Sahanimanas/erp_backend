export interface StudentEducationRow {
  courseName?: string;
  passingYear?: string;
  marksOrGrade?: string;
  schoolName?: string;
}

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
  category?: string;
  caste?: string;
  religion?: string;
  motherTongue?: string;
  aadharNumber?: string;
  penNumber?: string;
  apaarNo?: string;
  smartCardNo?: string;
  height?: string;
  weight?: string;
  remarks?: string;
  admissionNumber?: string;
  registrationNo?: string;
  feePlan?: string;
  session?: string;
  educationHistory?: StudentEducationRow[];
  photo?: string;
  fatherName?: string;
  motherName?: string;
  fatherAadhar?: string;
  motherAadhar?: string;
  fatherOccupation?: string;
  motherOccupation?: string;
  fatherQualification?: string;
  motherQualification?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  address?: string;
  permanentAddress?: string;
  city?: string;
  pincode?: string;
  hostelAllotted?: boolean;
  hostelName?: string;
  hostelRoomNo?: string;
  transportAllotted?: boolean;
  transportRoute?: string;
  busNo?: string;
}

export interface UpdateStudentRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  enabled?: boolean;
  dateOfBirth?: Date;
  gender?: string;
  sectionId?: string;
  classId?: string;
  sectionName?: string;
  admissionNumber?: string;
  admissionDate?: Date;
  rollNumber?: string;
  bloodGroup?: string;
  category?: string;
  caste?: string;
  religion?: string;
  motherTongue?: string;
  aadharNumber?: string;
  penNumber?: string;
  apaarNo?: string;
  smartCardNo?: string;
  height?: string;
  weight?: string;
  remarks?: string;
  registrationNo?: string;
  feePlan?: string;
  session?: string;
  educationHistory?: StudentEducationRow[];
  photo?: string;
  fatherName?: string;
  motherName?: string;
  fatherAadhar?: string;
  motherAadhar?: string;
  fatherOccupation?: string;
  motherOccupation?: string;
  fatherQualification?: string;
  motherQualification?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  address?: string;
  permanentAddress?: string;
  city?: string;
  pincode?: string;
  hostelAllotted?: boolean;
  hostelName?: string;
  hostelRoomNo?: string;
  transportAllotted?: boolean;
  transportRoute?: string;
  busNo?: string;
}

export interface UploadStudentDocumentRequest {
  type: string;
  fileUrl: string;
}

export interface BulkImportStudentRequest {
  csvData: string;
}
