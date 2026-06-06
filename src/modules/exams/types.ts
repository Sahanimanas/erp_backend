export interface CreateExamRequest {
  name: string;
  type: 'UNIT_TEST' | 'HALF_YEARLY' | 'YEARLY' | 'MONTHLY' | 'CLASS_TEST';
  startDate: Date;
  endDate: Date;
}

export interface AddExamSubjectRequest {
  examId: string;
  subjectId: string;
  totalMarks: number;
  passingMarks: number;
}

export interface EnterStudentMarksRequest {
  studentId: string;
  examId: string;
  subjectId: string;
  marks: number;
}

export interface ReportCardRequest {
  studentId: string;
  examId: string;
}

export interface PerformanceRequest {
  studentId: string;
  startDate?: Date;
  endDate?: Date;
}
