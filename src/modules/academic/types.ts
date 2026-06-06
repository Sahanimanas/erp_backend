// Academic module types

export interface CreateAcademicYearRequest {
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface UpdateAcademicYearRequest {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

export interface CreateClassRequest {
  name: string;
  academicYearId: string;
  description?: string;
  classTeacherId?: string;
}

export interface UpdateClassRequest {
  name?: string;
  description?: string;
  classTeacherId?: string;
}

export interface CreateSectionRequest {
  classId: string;
  name: string;
  strength?: number;
}

export interface UpdateSectionRequest {
  name?: string;
  strength?: number;
}

export interface AssignStudentToSectionRequest {
  sectionId: string;
  studentId: string;
}

export interface CreateSubjectRequest {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateSubjectRequest {
  name?: string;
  code?: string;
  description?: string;
}

export interface AssignTeacherToSubjectRequest {
  classId: string;
  subjectId: string;
  teacherId: string;
}

export interface ClassSubjectWithDetails {
  id: string;
  classId: string;
  subjectId: string;
  teacherId?: string;
  subject: {
    id: string;
    name: string;
    code: string;
  };
  teacher?: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}
